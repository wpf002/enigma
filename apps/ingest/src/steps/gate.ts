// Phase 3: candidate blocking and the comparability gate.
// Blocking is done here. Every score is computed by the engine.
import { getDb, type Prisma } from '@enigma/db';
import { ENDPOINT_BY_ID, endpointGroup, endpointPath, RULE_SET_VERSION } from '@enigma/harmonize';
import type { Factor } from '@enigma/provenance';
import { chunk, createLogger, gateTuning, type EnigmaConfig } from '@enigma/shared';
import { clearDerived, recordRun } from '../context.js';
import { callEngine, engineRuleVersion } from '../engine.js';

const log = createLogger('gate');

const RECORD_FIELDS = {
  id: true, nctId: true, endpointNodeId: true, measure: true, sourceKind: true, outcomeType: true,
  value: true, ciLow: true, ciHigh: true, se: true, nAnalyzed: true, controlRisk: true, pooledSd: true, units: true,
  lowerIsBetter: true, directionResolved: true, experimentalLabel: true, comparatorLabel: true,
  agents: true, agentClass: true, doseDaily: true, doseUnit: true, comparatorClass: true, comparatorAgents: true,
  backgroundAgents: true, comparatorDoseDaily: true,
  interventionHash: true, timepointDays: true, analysisPopulation: true,
} as const;

type Rec = Prisma.EffectRecordGetPayload<{ select: typeof RECORD_FIELDS }>;

interface EngineEdge {
  aId: string;
  bId: string;
  gateScore: number;
  passed: boolean;
  weakestDimension: string;
  dimensionScores: Record<string, number>;
  failureReasons: Record<string, string>;
  commonMeasure: string | null;
  apparentConflict: boolean;
  factors: Factor[];
}

/** One trial's results for one endpoint and one pair of arms, across visits. */
interface Series {
  key: string;
  nctId: string;
  records: Rec[];
}

/** Families where trials of different agents in one class are routinely read against each other. */
const CLASS_LEVEL_FAMILIES = new Set(['cv', 'renal']);

export const toEngineRecord = (r: Rec) => ({
  id: r.id,
  nctId: r.nctId,
  endpointNodeId: r.endpointNodeId,
  endpointPath: r.endpointNodeId ? endpointPath(r.endpointNodeId) : [],
  measure: r.measure,
  value: r.value.toNumber(),
  ciLow: r.ciLow!.toNumber(),
  ciHigh: r.ciHigh!.toNumber(),
  se: r.se!.toNumber(),
  n: r.nAnalyzed,
  controlRisk: r.controlRisk?.toNumber() ?? null,
  pooledSd: r.pooledSd?.toNumber() ?? null,
  units: r.units,
  lowerIsBetter: r.lowerIsBetter,
  directionResolved: r.directionResolved,
  agents: r.agents,
  agentClass: r.agentClass,
  doseDaily: r.doseDaily?.toNumber() ?? null,
  doseUnit: r.doseUnit,
  comparatorClass: r.comparatorClass,
  comparatorAgents: r.comparatorAgents,
  backgroundAgents: r.backgroundAgents,
  comparatorDoseDaily: r.comparatorDoseDaily?.toNumber() ?? null,
  timepointDays: r.timepointDays,
  analysisPopulation: r.analysisPopulation,
});

function lexLess(x: number[], y: number[]): boolean {
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i]! < y[i]!;
  return false;
}

/**
 * Picks the pair of records two series are compared on: same measure first,
 * then the closest follow-up, then posted analyses and primary outcomes.
 */
function alignedPair(a: Series, b: Series): [Rec, Rec] {
  let best: [Rec, Rec] | null = null;
  let bestKey: number[] = [];
  for (const x of a.records) {
    for (const y of b.records) {
      const gap = x.timepointDays && y.timepointDays ? Math.abs(x.timepointDays - y.timepointDays) : 1e9;
      const key = [
        x.measure === y.measure ? 0 : 1,
        gap,
        (x.sourceKind === 'ANALYSIS' ? 0 : 1) + (y.sourceKind === 'ANALYSIS' ? 0 : 1),
        (x.outcomeType === 'PRIMARY' ? 0 : 1) + (y.outcomeType === 'PRIMARY' ? 0 : 1),
        -Math.max(x.timepointDays ?? 0, y.timepointDays ?? 0),
      ];
      if (!best || lexLess(key, bestKey)) {
        best = [x, y];
        bestKey = key;
      }
    }
  }
  return best!;
}

export async function runGate(config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const tuning = gateTuning(config);
  const ruleVersion = `${RULE_SET_VERSION}+${await engineRuleVersion(config)}`;
  await clearDerived(snapshotId, 'gate');

  const records = await db.effectRecord.findMany({
    where: { snapshotId, endpointNodeId: { not: null }, se: { not: null } },
    select: RECORD_FIELDS,
  });
  if (records.length === 0) throw new Error('no harmonized records: run `pnpm ingest harmonize` first');
  const trials = await db.trial.findMany({ where: { snapshotId }, select: { nctId: true, population: true } });
  const populations = new Map(trials.map((t) => [t.nctId, t.population]));

  // ---- blocking: series, then (endpoint group, intervention) blocks
  const series = new Map<string, Series>();
  let ungated = 0;
  for (const r of records) {
    if (!r.interventionHash) {
      ungated += 1;
      continue;
    }
    const key = `${r.nctId}|${r.endpointNodeId}|${r.experimentalLabel}|${r.comparatorLabel}`;
    const s = series.get(key);
    if (s) s.records.push(r);
    else series.set(key, { key, nctId: r.nctId, records: [r] });
  }
  const blocks = new Map<string, Series[]>();
  const addTo = (blockKey: string, s: Series) => {
    const bucket = blocks.get(blockKey);
    if (bucket) bucket.push(s);
    else blocks.set(blockKey, [s]);
  };
  for (const s of series.values()) {
    const first = s.records[0]!;
    const group = endpointGroup(first.endpointNodeId!);
    addTo(`${group}|agent:${first.interventionHash}`, s);
    const family = ENDPOINT_BY_ID.get(first.endpointNodeId!)?.family ?? '';
    if (CLASS_LEVEL_FAMILIES.has(family) && first.agentClass) addTo(`${group}|class:${first.agentClass}`, s);
  }

  const candidates: { a: Rec; b: Rec; blockKey: string }[] = [];
  const seen = new Set<string>();
  // agent-level blocks first, so a pair found in both keeps the narrower block key
  const ordered = [...blocks.entries()].sort(([x], [y]) => Number(x.includes('|class:')) - Number(y.includes('|class:')));
  for (const [blockKey, members] of ordered) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const [s1, s2] = members[i]!.key < members[j]!.key ? [members[i]!, members[j]!] : [members[j]!, members[i]!];
        if (s1.nctId === s2.nctId) continue;
        const pairKey = `${s1.key}::${s2.key}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const [a, b] = alignedPair(s1, s2);
        candidates.push({ a, b, blockKey });
      }
    }
  }
  log.info('blocking complete', { records: records.length, series: series.size, blocks: blocks.size, candidates: candidates.length, ungated });

  const stats = {
    records: records.length,
    recordsWithoutAgent: ungated,
    series: series.size,
    blocks: blocks.size,
    candidates: candidates.length,
    allPairsAvoided: (records.length * (records.length - 1)) / 2 - candidates.length,
    passed: 0,
    failed: 0,
    byWeakestDimension: {} as Record<string, number>,
    byReason: {} as Record<string, number>,
    apparentConflicts: 0,
    apparentConflictsDissolved: 0,
  };

  for (const batch of chunk(candidates, 2000)) {
    const used = new Map<string, Rec>();
    for (const c of batch) {
      used.set(c.a.id, c.a);
      used.set(c.b.id, c.b);
    }
    const ncts = new Set([...used.values()].map((r) => r.nctId));
    const res = await callEngine<{ edges: EngineEdge[] }>(config, '/v1/gate/score', {
      tuning,
      records: [...used.values()].map(toEngineRecord),
      populations: Object.fromEntries([...ncts].map((n) => [n, populations.get(n) ?? {}])),
      pairs: batch.map((c) => [c.a.id, c.b.id]),
    });
    const rows: Prisma.ComparabilityEdgeCreateManyInput[] = res.edges.map((e, i) => {
      const c = batch[i]!;
      if (e.passed) stats.passed += 1;
      else {
        stats.failed += 1;
        stats.byWeakestDimension[e.weakestDimension] = (stats.byWeakestDimension[e.weakestDimension] ?? 0) + 1;
        for (const reason of Object.values(e.failureReasons)) stats.byReason[reason] = (stats.byReason[reason] ?? 0) + 1;
      }
      if (e.apparentConflict) {
        stats.apparentConflicts += 1;
        if (!e.passed) stats.apparentConflictsDissolved += 1;
      }
      const factors = e.passed ? e.factors : e.factors.filter((f) => f.outcome === 'FAIL');
      return {
        snapshotId,
        aId: e.aId,
        bId: e.bId,
        aNctId: c.a.nctId,
        bNctId: c.b.nctId,
        blockKey: c.blockKey,
        gateScore: e.gateScore,
        passed: e.passed,
        weakestDimension: e.weakestDimension,
        dimensionScores: e.dimensionScores,
        failureReasons: e.failureReasons,
        commonMeasure: e.commonMeasure,
        apparentConflict: e.apparentConflict,
        factors: factors as unknown as Prisma.InputJsonValue,
        ruleVersion,
      };
    });
    for (const part of chunk(rows, 1000)) await db.comparabilityEdge.createMany({ data: part });
    log.info('batch scored', { scored: stats.passed + stats.failed, passed: stats.passed });
  }

  const gate = {
    // Phase 3 exit gate: recover >= 85% of a review's included pairs, reject >= 90% of excluded ones.
    reviewRecovery: 'see `pnpm ingest gate-eval`',
    threshold: tuning.gateThreshold,
    passRate: stats.candidates ? stats.passed / stats.candidates : 0,
  };
  await recordRun(snapshotId, 'gate', ruleVersion, { ...stats, tuning, gate }, startedAt);
  log.info('gate complete', { ...stats, gate });
}
