// Phase 5: diagnostic value ranking. The weighted sum is computed by the engine.
import { getDb } from '@enigma/db';
import type { Factor } from '@enigma/provenance';
import { FactorChain } from '@enigma/provenance';
import { chunk, createLogger, type EnigmaConfig } from '@enigma/shared';
import { recordRun } from '../context.js';
import { callEngine, engineRuleVersion } from '../engine.js';

const log = createLogger('rank');

interface Ranked {
  id: string;
  diagnosticValue: number;
  components: Record<string, number>;
  rank: number;
  factors: Factor[];
}

export async function runRank(config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const ruleVersion = await engineRuleVersion(config);
  const contradictions = await db.contradiction.findMany({ where: { snapshotId } });
  if (contradictions.length === 0) {
    log.warn('no contradictions to rank');
    return;
  }
  const clusters = new Map((await db.cluster.findMany({ where: { snapshotId }, select: { id: true, nPatients: true } })).map((c) => [c.id, c.nPatients]));
  const recordIds = [...new Set(contradictions.flatMap((c) => [c.aId, c.bId]).filter((x): x is string => x !== null))];
  const sizes = new Map<string, number>();
  for (const part of chunk(recordIds, 5000)) {
    for (const r of await db.effectRecord.findMany({ where: { id: { in: part } }, select: { id: true, nAnalyzed: true } })) sizes.set(r.id, r.nAnalyzed ?? 0);
  }

  const res = await callEngine<{ results: Ranked[] }>(config, '/v1/rank', {
    items: contradictions.map((c) => {
      const k = c.components as Record<string, number>;
      // patients across the cluster the conflict sits in, or across the two trials when it has no cluster
      const pair = (c.aId ? (sizes.get(c.aId) ?? 0) : 0) + (c.bId ? (sizes.get(c.bId) ?? 0) : 0);
      return {
        id: c.id,
        gateConfidence: c.gateConfidence.toNumber(),
        severity: c.severity.toNumber(),
        patients: Math.max(pair, c.clusterId ? (clusters.get(c.clusterId) ?? 0) : 0),
        unexplainedResidual: k.unexplainedResidual ?? 0,
        discriminability: k.discriminability ?? 0,
        alreadyResolved: k.alreadyResolved ?? 0,
      };
    }),
  });

  const byId = new Map(contradictions.map((c) => [c.id, c]));
  const updates = res.results.map((r) => {
    const c = byId.get(r.id)!;
    const prior = (c.factors as unknown as Factor[]).filter((f) => f.stage !== 'RANK');
    const kept = c.components as Record<string, number>;
    return {
      id: r.id,
      diagnosticValue: r.diagnosticValue,
      rank: r.rank,
      components: { ...r.components, zDiff: kept.zDiff ?? null, pDiff: kept.pDiff ?? null, qDiff: kept.qDiff ?? null },
      factors: FactorChain.from(prior).extend(r.factors).toJSON(),
    };
  });
  for (const part of chunk(updates, 500)) {
    await db.$executeRaw`
      UPDATE "Contradiction" c
         SET "diagnosticValue" = x."diagnosticValue", rank = x.rank, components = x.components, factors = x.factors
        FROM jsonb_to_recordset(${JSON.stringify(part)}::jsonb)
             AS x(id text, "diagnosticValue" numeric, rank int, components jsonb, factors jsonb)
       WHERE c.id = x.id`;
  }
  const top = res.results.slice(0, 5).map((r) => ({ rank: r.rank, diagnosticValue: r.diagnosticValue, type: byId.get(r.id)!.type }));
  await recordRun(snapshotId, 'rank', ruleVersion, { ranked: updates.length, top }, startedAt);
  log.info('rank complete', { ranked: updates.length, top });
}
