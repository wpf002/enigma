// Phase 4: statistical incompatibility on pairs and clusters that passed the gate.
// The query below reads only edges with passed = true. The engine also refuses
// any pair whose gate score is under threshold.
import {
  DIMENSION_LABEL, type Claim, type ClaimCondition, type ClaimParty, type ContradictionType, type DiscriminatingVariable,
} from '@enigma/core';
import { getDb, type Prisma } from '@enigma/db';
import { AGENT_BY_ID, COMPARATOR_LABEL, ENDPOINT_BY_ID, endpointGroup, RULE_SET_VERSION, type ComparatorClass } from '@enigma/harmonize';
import { FactorChain, type Factor } from '@enigma/provenance';
import { chunk, createLogger, gateTuning, hashOf, type EnigmaConfig } from '@enigma/shared';
import { clearDerived, recordRun } from '../context.js';
import { callEngine, engineRuleVersion } from '../engine.js';
import { syncReviews, type ReviewFixture } from '../reviews.js';
import { toEngineRecord } from './gate.js';

const log = createLogger('contradict');

/** False discovery rate the pairwise difference tests are held to. */
const FDR_LEVEL = 0.05;

type Rec = Prisma.EffectRecordGetPayload<object>;
type Edge = Prisma.ComparabilityEdgeGetPayload<object>;
type TrialRow = Prisma.TrialGetPayload<object>;

interface EffectOut { measure: string; value: number; ciLow: number; ciHigh: number; ciLevel: number; se: number }
interface Discriminator { basis: 'MEASURED' | 'UNIDENTIFIED'; name: string; a: string | null; b: string | null; weight: number }
interface PairResult {
  edgeId: string;
  type: 'C1' | 'C2' | 'C3' | null;
  severity: number | null;
  zDiff: number;
  pDiff: number;
  a: EffectOut;
  b: EffectOut;
  unexplainedResidual: number;
  discriminability: number;
  discriminator: Discriminator;
  factors: Factor[];
}
interface ClusterFinding {
  type: 'C4' | 'C5';
  severity: number;
  unexplainedResidual: number;
  discriminability: number;
  discriminator: Discriminator;
  aLabel: string;
  bLabel: string;
  aNctIds: string[];
  bNctIds: string[];
  a: EffectOut;
  b: EffectOut;
  factors: Factor[];
}
interface ClusterResult {
  key: string;
  k: number;
  nPatients: number;
  measure: string;
  pooled: Record<string, number> | null;
  cumulative: unknown[];
  moderators: unknown[];
  dropped: string[];
  findings: ClusterFinding[];
}

/**
 * Contradiction ids are derived from what the contradiction is, so a rebuild of the same snapshot
 * with the same rules gives the same ids and saved links keep working.
 */
const stableId = (...parts: (string | null)[]) => `c${hashOf(parts).slice(0, 24)}`;
const recordKey = (r: Rec) => `${r.nctId}|${r.outcomeMeasureId}|${r.classification ?? ''}|${r.experimentalLabel}|${r.comparatorLabel}`;

const seriesKey = (r: Pick<Rec, 'nctId' | 'endpointNodeId' | 'experimentalLabel' | 'comparatorLabel'>) =>
  `${r.nctId}|${r.endpointNodeId}|${r.experimentalLabel}|${r.comparatorLabel}`;

const trialLabel = (t: TrialRow | undefined, nctId: string) => (t?.acronym ? `${t.acronym} (${nctId})` : nctId);
const agentLabel = (ids: string[]) => ids.map((id) => AGENT_BY_ID.get(id)?.label ?? id).join(' + ');
const days = (d: number | null) => (d === null ? 'not recorded' : d >= 540 ? `${(d / 365.25).toFixed(1)} years` : `${Math.round(d / 7)} weeks`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const toParty = (kind: ClaimParty['kind'], label: string, nctIds: string[], e: EffectOut, unit: string | null = null): ClaimParty => ({
  kind, label, nctIds, unit: e.measure === 'MD' ? unit : null,
  effect: { measure: e.measure as ClaimParty['effect']['measure'], value: e.value, ciLow: e.ciLow, ciHigh: e.ciHigh, ciLevel: e.ciLevel },
});

const toDiscriminator = (d: Discriminator): DiscriminatingVariable => ({ basis: d.basis, name: d.name, a: d.a, b: d.b });

/** The conditions the gate established for a pair, one per dimension. */
function pairConditions(edge: Edge, a: Rec, b: Rec): ClaimCondition[] {
  const s = edge.dimensionScores as Record<string, number>;
  const node = ENDPOINT_BY_ID.get(a.endpointNodeId!);
  const dose = a.doseDaily && b.doseDaily
    ? `${a.doseDaily.toNumber()} and ${b.doseDaily.toNumber()} ${a.doseUnit}/day`
    : 'dose not encoded for one or both';
  return [
    { dimension: 'endpoint', statement: `same endpoint (${node?.label ?? a.endpointNodeId})` },
    { dimension: 'measure', statement: a.measure === b.measure ? `same measure (${a.measure})` : `${a.measure} and ${b.measure} expressed as ${edge.commonMeasure}` },
    { dimension: 'population', statement: `eligibility overlap ${s.population?.toFixed(2)}` },
    { dimension: 'intervention', statement: `same agent (${agentLabel(a.agents)}), ${dose}` },
    { dimension: 'comparator', statement: `${COMPARATOR_LABEL[a.comparatorClass as ComparatorClass]?.toLowerCase() ?? 'same'} comparator in both` },
    { dimension: 'timepoint', statement: `follow-up ${days(a.timepointDays)} and ${days(b.timepointDays)}` },
    { dimension: 'analysisPopulation', statement: `${a.analysisPopulation} and ${b.analysisPopulation} analysis sets` },
    { dimension: 'direction', statement: 'experimental arm first in both' },
  ];
}

function alreadyResolved(
  reviews: ReviewFixture[],
  c: { endpointNodeId: string; nctIds: string[]; agents: string[]; agentClass: string | null },
): { value: number; ref: string | null; rule: string } {
  let best = { value: 0, ref: null as string | null, rule: 'resolved.no_review' };
  for (const r of reviews) {
    if (!r.endpointNodeIds.includes(c.endpointNodeId) && !r.endpointNodeIds.includes(endpointGroup(c.endpointNodeId))) continue;
    const covered = r.includedNctIds.length > 0 && c.nctIds.every((n) => r.includedNctIds.includes(n));
    const scoped = c.agents.some((a) => r.agents.includes(a)) || (c.agentClass !== null && r.agentClasses.includes(c.agentClass));
    const value = covered ? 1 : scoped ? 0.5 : 0;
    if (value > best.value) {
      best = { value, ref: r.id, rule: covered ? 'resolved.review_includes_all_trials' : 'resolved.review_covers_agent_and_endpoint' };
    }
  }
  return best;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string): void {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export async function runContradict(config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const tuning = gateTuning(config);
  const ruleVersion = `${RULE_SET_VERSION}+${await engineRuleVersion(config)}`;
  await clearDerived(snapshotId, 'contradict');
  const reviews = await syncReviews();

  // Gate first, always: only edges that passed are read.
  const edges = await db.comparabilityEdge.findMany({ where: { snapshotId, passed: true } });
  if (edges.length === 0) throw new Error('no gate-pass edges: run `pnpm ingest gate` first');
  const recordIds = [...new Set(edges.flatMap((e) => [e.aId, e.bId]))];
  const records = new Map<string, Rec>();
  for (const part of chunk(recordIds, 5000)) {
    for (const r of await db.effectRecord.findMany({ where: { id: { in: part } } })) records.set(r.id, r);
  }
  // fixed order, independent of row ids and of the order Postgres returns rows in
  const edgeKey = (e: Edge) => `${recordKey(records.get(e.aId)!)}::${recordKey(records.get(e.bId)!)}`;
  edges.sort((x, y) => (edgeKey(x) < edgeKey(y) ? -1 : edgeKey(x) > edgeKey(y) ? 1 : 0));
  const trials = new Map((await db.trial.findMany({ where: { snapshotId } })).map((t) => [t.nctId, t]));
  const trialMeta = (nctId: string) => {
    const t = trials.get(nctId);
    return { status: t?.status ?? null, stopCategory: t?.stopCategory ?? null, completionDate: iso(t?.completionDate ?? null), sponsorClass: t?.sponsorClass ?? null, acronym: t?.acronym ?? null };
  };

  // ---------------------------------------------------------------- clusters
  const uf = new UnionFind();
  for (const e of edges) uf.union(seriesKey(records.get(e.aId)!), seriesKey(records.get(e.bId)!));
  const components = new Map<string, Edge[]>();
  for (const e of edges) {
    const root = uf.find(seriesKey(records.get(e.aId)!));
    const bucket = components.get(root);
    if (bucket) bucket.push(e);
    else components.set(root, [e]);
  }

  interface Built {
    key: string;
    label: string;
    endpointNodeId: string;
    measure: string;
    members: Rec[];
    density: number;
    minGateScore: number;
    seriesKeys: Set<string>;
  }
  const built: Built[] = [];
  for (const componentEdges of components.values()) {
    const degree = new Map<string, number>();
    const usage = new Map<string, Map<string, number>>();
    for (const e of componentEdges) {
      for (const id of [e.aId, e.bId]) {
        const key = seriesKey(records.get(id)!);
        degree.set(key, (degree.get(key) ?? 0) + 1);
        const u = usage.get(key) ?? new Map<string, number>();
        u.set(id, (u.get(id) ?? 0) + 1);
        usage.set(key, u);
      }
    }
    // one series per trial: the one with the most gate-pass comparisons
    const byTrial = new Map<string, string>();
    for (const [key, d] of degree) {
      const nct = key.split('|')[0]!;
      const current = byTrial.get(nct);
      if (!current || d > degree.get(current)! || (d === degree.get(current) && key < current)) byTrial.set(nct, key);
    }
    if (byTrial.size < 2) continue;
    const chosen = new Set(byTrial.values());
    // representative record per series: the one used in the most edges
    const members = [...chosen].map((key) => {
      const ranked = [...usage.get(key)!.entries()].sort(
        (x, y) => y[1] - x[1] || (records.get(y[0])!.nAnalyzed ?? 0) - (records.get(x[0])!.nAnalyzed ?? 0) ||
          (recordKey(records.get(x[0])!) < recordKey(records.get(y[0])!) ? -1 : 1),
      );
      return records.get(ranked[0]![0])!;
    });
    const linked = new Set<string>();
    let minGateScore = 1;
    for (const e of componentEdges) {
      const [ka, kb] = [seriesKey(records.get(e.aId)!), seriesKey(records.get(e.bId)!)];
      if (!chosen.has(ka) || !chosen.has(kb)) continue;
      linked.add([ka, kb].sort().join('::'));
      minGateScore = Math.min(minGateScore, e.gateScore.toNumber());
    }
    const k = members.length;
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.measure, (counts.get(m.measure) ?? 0) + 1);
    const measure = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0];
    const first = members[0]!;
    const node = ENDPOINT_BY_ID.get(first.endpointNodeId!);
    built.push({
      key: `${first.endpointNodeId}|${first.interventionHash}|${hashOf([...chosen].sort()).slice(0, 10)}`,
      label: `${node?.label ?? first.endpointNodeId}: ${agentLabel(first.agents)} vs ${COMPARATOR_LABEL[first.comparatorClass as ComparatorClass]?.toLowerCase() ?? 'control'}`,
      endpointNodeId: first.endpointNodeId!,
      measure,
      members,
      density: linked.size / ((k * (k - 1)) / 2),
      minGateScore,
      seriesKeys: new Set(degree.keys()),
    });
  }

  const clusterResults = new Map<string, ClusterResult>();
  for (const part of chunk(built, 200)) {
    const res = await callEngine<{ results: ClusterResult[] }>(config, '/v1/contradictions/clusters', {
      tuning,
      clusters: part.map((c) => ({
        key: c.key,
        commonMeasure: c.measure,
        density: c.density,
        members: c.members.map((m) => {
          const t = trials.get(m.nctId);
          const baseline = (t?.population as { baseline?: Record<string, number | null> } | undefined)?.baseline ?? {};
          const mods: Record<string, number> = {};
          const put = (name: string, v: number | null | undefined) => {
            if (typeof v === 'number' && Number.isFinite(v)) mods[name] = v;
          };
          put('follow-up (days)', m.timepointDays);
          put('daily dose', m.doseDaily?.toNumber());
          put('baseline HbA1c', baseline.hba1cMean);
          put('baseline age', baseline.ageMean);
          put('completion year', t?.completionDate ? t.completionDate.getUTCFullYear() : null);
          put('comparator-arm risk', m.controlRisk?.toNumber());
          put('log sample size', m.nAnalyzed ? Math.log(m.nAnalyzed) : null);
          return { record: toEngineRecord(m), label: trialLabel(t, m.nctId), completionDate: iso(t?.completionDate ?? null), moderators: mods };
        }),
      })),
    });
    for (const r of res.results) clusterResults.set(r.key, r);
  }

  const clusterIdBySeries = new Map<string, string>();
  const clusterRows = new Map<string, { id: string; built: Built; result: ClusterResult }>();
  for (const c of built) {
    const result = clusterResults.get(c.key)!;
    const first = c.members[0]!;
    const row = await db.cluster.create({
      data: {
        snapshotId,
        key: c.key,
        label: c.label,
        endpointNodeId: c.endpointNodeId,
        measure: result.measure,
        agents: first.agents,
        agentClass: first.agentClass,
        comparatorClass: first.comparatorClass,
        k: result.k,
        nPatients: result.nPatients,
        density: c.density,
        minGateScore: c.minGateScore,
        memberIds: c.members.map((m) => m.id),
        nctIds: c.members.map((m) => m.nctId),
        stats: { pooled: result.pooled, cumulative: result.cumulative, moderators: result.moderators, dropped: result.dropped } as Prisma.InputJsonValue,
      },
    });
    for (const key of c.seriesKeys) clusterIdBySeries.set(key, row.id);
    clusterRows.set(c.key, { id: row.id, built: c, result });
  }
  // tag each gate-pass edge with its cluster, for the contradiction map
  const edgeClusters = edges
    .map((e) => ({ id: e.id, clusterId: clusterIdBySeries.get(seriesKey(records.get(e.aId)!)) ?? null }))
    .filter((x) => x.clusterId !== null);
  for (const part of chunk(edgeClusters, 2000)) {
    await db.$executeRaw`
      UPDATE "ComparabilityEdge" e SET "clusterId" = x."clusterId"
        FROM jsonb_to_recordset(${JSON.stringify(part)}::jsonb) AS x(id text, "clusterId" text)
       WHERE e.id = x.id`;
  }
  log.info('clusters built', { clusters: built.length, withThreeOrMore: built.filter((c) => c.members.length >= 3).length });

  // ------------------------------------------------------------------- pairs
  const tested: { e: Edge; r: PairResult }[] = [];
  const stats = {
    edgesTested: edges.length,
    candidatesBeforeFdr: 0,
    fdrLevel: FDR_LEVEL,
    clusters: built.length,
    byType: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 } as Record<ContradictionType, number>,
    alreadyResolved: { full: 0, partial: 0 },
    discriminatorNamed: 0,
  };
  const rows: Prisma.ContradictionCreateManyInput[] = [];
  const tally = (resolved: number, d: Discriminator, type: ContradictionType) => {
    stats.byType[type] += 1;
    if (resolved === 1) stats.alreadyResolved.full += 1;
    else if (resolved > 0) stats.alreadyResolved.partial += 1;
    if (d.basis === 'MEASURED') stats.discriminatorNamed += 1;
  };

  for (const part of chunk(edges, 1000)) {
    const res = await callEngine<{ results: PairResult[] }>(config, '/v1/contradictions/pairs', {
      tuning,
      items: part.map((e) => {
        const [a, b] = [records.get(e.aId)!, records.get(e.bId)!];
        return {
          edgeId: e.id,
          gateScore: e.gateScore.toNumber(),
          commonMeasure: e.commonMeasure,
          dimensionScores: e.dimensionScores,
          a: toEngineRecord(a),
          b: toEngineRecord(b),
          populationA: trials.get(a.nctId)?.population ?? {},
          populationB: trials.get(b.nctId)?.population ?? {},
          trialA: trialMeta(a.nctId),
          trialB: trialMeta(b.nctId),
        };
      }),
    });
    for (const [i, r] of res.results.entries()) tested.push({ e: part[i]!, r });
  }

  // Multiplicity: thousands of pairs are tested, so the difference test is held to a
  // Benjamini-Hochberg false discovery rate across all of them.
  const fdr = await callEngine<{ qValues: number[] }>(config, '/v1/contradictions/fdr', { pValues: tested.map((t) => t.r.pDiff) });
  stats.candidatesBeforeFdr = tested.filter((t) => t.r.type).length;
  {
    for (const [i, { e, r }] of tested.entries()) {
      const q = fdr.qValues[i]!;
      if (!r.type || r.severity === null || q >= FDR_LEVEL) continue;
      const [a, b] = [records.get(e.aId)!, records.get(e.bId)!];
      const node = ENDPOINT_BY_ID.get(a.endpointNodeId!);
      const nctIds = [a.nctId, b.nctId];
      const resolved = alreadyResolved(reviews, { endpointNodeId: a.endpointNodeId!, nctIds, agents: a.agents, agentClass: a.agentClass });
      const claim: Claim = {
        type: r.type,
        endpoint: node?.label ?? a.endpointNodeId!,
        a: toParty('TRIAL_RESULT', `${trialLabel(trials.get(a.nctId), a.nctId)}, ${a.experimentalLabel} vs ${a.comparatorLabel}`, [a.nctId], r.a, a.units),
        b: toParty('TRIAL_RESULT', `${trialLabel(trials.get(b.nctId), b.nctId)}, ${b.experimentalLabel} vs ${b.comparatorLabel}`, [b.nctId], r.b, b.units),
        conditions: pairConditions(e, a, b),
        discriminatingVariable: toDiscriminator(r.discriminator),
      };
      const chain = new FactorChain()
        .extend((a.factors as unknown as Factor[]).map((f) => ({ ...f, subject: 'A' as const })))
        .extend((b.factors as unknown as Factor[]).map((f) => ({ ...f, subject: 'B' as const })))
        .extend(e.factors as unknown as Factor[])
        .extend(r.factors)
        .add({
          stage: 'CONTRADICTION',
          name: 'contradiction.multiplicity',
          rule: 'multiplicity.benjamini_hochberg',
          ruleVersion,
          inputs: { pDiff: r.pDiff, pairsTested: tested.length },
          threshold: { name: 'fdrLevel', value: FDR_LEVEL, op: '<' },
          output: q,
          outcome: 'FAIL',
          note: 'q-value of the difference test across every gate-pass pair in the snapshot.',
        })
        .add({
          stage: 'CONTRADICTION',
          name: 'contradiction.already_resolved',
          rule: resolved.rule,
          ruleVersion: RULE_SET_VERSION,
          inputs: { endpoint: a.endpointNodeId, nctIds, agents: a.agents, agentClass: a.agentClass, reviewsChecked: reviews.length },
          output: resolved.ref,
          score: resolved.value,
          note: resolved.ref ? `Covered by ${resolved.ref}.` : 'No listed review covers this pair.',
        });
      tally(resolved.value, r.discriminator, r.type);
      rows.push({
        id: stableId(snapshotId, r.type, a.endpointNodeId, ...[recordKey(a), recordKey(b)].sort()),
        snapshotId,
        edgeId: e.id,
        clusterId: clusterIdBySeries.get(seriesKey(a)) ?? null,
        aId: a.id,
        bId: b.id,
        nctIds,
        endpointNodeId: a.endpointNodeId!,
        agents: a.agents,
        agentClass: a.agentClass,
        type: r.type,
        severity: r.severity,
        gateConfidence: e.gateScore,
        diagnosticValue: 0,
        components: { unexplainedResidual: r.unexplainedResidual, discriminability: r.discriminability, alreadyResolved: resolved.value, zDiff: r.zDiff, pDiff: r.pDiff, qDiff: q },
        discriminatingVariable: r.discriminator.basis === 'MEASURED' ? r.discriminator.name : null,
        alreadyResolvedRef: resolved.ref,
        claim: claim as unknown as Prisma.InputJsonValue,
        factors: chain.toJSON() as unknown as Prisma.InputJsonValue,
      });
    }
  }

  // ---------------------------------------------------------------- C4 / C5
  for (const { id, built: c, result } of clusterRows.values()) {
    for (const f of result.findings) {
      const first = c.members[0]!;
      const node = ENDPOINT_BY_ID.get(c.endpointNodeId);
      const nctIds = [...new Set([...f.aNctIds, ...f.bNctIds])];
      const resolved = alreadyResolved(reviews, { endpointNodeId: c.endpointNodeId, nctIds: c.members.map((m) => m.nctId), agents: first.agents, agentClass: first.agentClass });
      const claim: Claim = {
        type: f.type,
        endpoint: node?.label ?? c.endpointNodeId,
        a: toParty(f.type === 'C5' ? 'POOLED_RESULT' : 'TRIAL_RESULT', f.aLabel, f.aNctIds, f.a, first.units),
        b: toParty(f.type === 'C5' ? 'POOLED_RESULT' : 'TRIAL_RESULT', f.bLabel, f.bNctIds, f.b, first.units),
        conditions: [
          { dimension: 'endpoint', statement: `same endpoint (${node?.label ?? c.endpointNodeId})` },
          { dimension: 'intervention', statement: `same agent (${agentLabel(first.agents)})` },
          { dimension: 'comparator', statement: `${COMPARATOR_LABEL[first.comparatorClass as ComparatorClass]?.toLowerCase() ?? 'same'} comparator in all` },
          { dimension: 'population', statement: `${result.k} trials linked by gate-pass comparisons, lowest gate score ${c.minGateScore.toFixed(2)}` },
        ],
        discriminatingVariable: toDiscriminator(f.discriminator),
      };
      const chain = new FactorChain()
        .add({
          stage: 'GATE',
          name: 'gate.cluster',
          rule: 'gate.cluster_of_pass_edges',
          ruleVersion: RULE_SET_VERSION,
          inputs: { trials: result.k, density: Number(c.density.toFixed(4)), dimensions: Object.values(DIMENSION_LABEL) },
          threshold: { name: 'gateThreshold', value: tuning.gateThreshold, op: '>=' },
          output: c.minGateScore,
          score: c.minGateScore,
          outcome: 'PASS',
          note: 'Cluster of trials connected by gate-pass edges. Confidence is the lowest gate score among them.',
        })
        .extend(f.factors)
        .add({
          stage: 'CONTRADICTION',
          name: 'contradiction.already_resolved',
          rule: resolved.rule,
          ruleVersion: RULE_SET_VERSION,
          inputs: { endpoint: c.endpointNodeId, agents: first.agents, agentClass: first.agentClass, reviewsChecked: reviews.length },
          output: resolved.ref,
          score: resolved.value,
          note: resolved.ref ? `Covered by ${resolved.ref}.` : 'No listed review covers this cluster.',
        });
      tally(resolved.value, f.discriminator, f.type);
      rows.push({
        id: stableId(snapshotId, f.type, c.key),
        snapshotId,
        clusterId: id,
        nctIds,
        endpointNodeId: c.endpointNodeId,
        agents: first.agents,
        agentClass: first.agentClass,
        type: f.type,
        severity: f.severity,
        gateConfidence: c.minGateScore,
        diagnosticValue: 0,
        components: { unexplainedResidual: f.unexplainedResidual, discriminability: f.discriminability, alreadyResolved: resolved.value },
        discriminatingVariable: f.discriminator.basis === 'MEASURED' ? f.discriminator.name : null,
        alreadyResolvedRef: resolved.ref,
        claim: claim as unknown as Prisma.InputJsonValue,
        factors: chain.toJSON() as unknown as Prisma.InputJsonValue,
      });
    }
  }

  for (const part of chunk(rows, 500)) await db.contradiction.createMany({ data: part });
  const emitted = rows.length;
  const gate = { controversies: 'see `pnpm ingest controversy-eval`', emitted, emittedPerPassEdge: edges.length ? emitted / edges.length : 0 };
  await recordRun(snapshotId, 'contradict', ruleVersion, { ...stats, gate }, startedAt);
  log.info('contradict complete', { ...stats, gate });
}
