import { DIMENSION_LABEL, GATE_DIMENSIONS } from '@enigma/core';
import { ruleRegistry } from '@enigma/harmonize';
import type { FastifyInstance } from 'fastify';
import { phaseGates } from '../gates.js';
import { contradictionSummary, db, snapshotFor } from '../util.js';

export async function overviewRoutes(app: FastifyInstance) {
  app.get('/v1/overview', async (req) => {
    const snapshot = await snapshotFor(req.query as { snapshot?: string });
    const where = { snapshotId: snapshot.id };
    const [trials, terminated, records, mapped, edges, passed, apparent, dissolved, contradictions, byType, clusters, weakest, top, unread] =
      await Promise.all([
        db.trial.count({ where }),
        db.trial.count({ where: { ...where, status: 'TERMINATED' } }),
        db.effectRecord.count({ where }),
        db.effectRecord.count({ where: { ...where, endpointNodeId: { not: null } } }),
        db.comparabilityEdge.count({ where }),
        db.comparabilityEdge.count({ where: { ...where, passed: true } }),
        db.comparabilityEdge.count({ where: { ...where, apparentConflict: true } }),
        db.comparabilityEdge.count({ where: { ...where, apparentConflict: true, passed: false } }),
        db.contradiction.count({ where }),
        db.contradiction.groupBy({ by: ['type'], where, _count: true }),
        db.cluster.count({ where }),
        db.comparabilityEdge.groupBy({ by: ['weakestDimension'], where: { ...where, passed: false }, _count: true }),
        db.contradiction.findMany({ where, orderBy: { rank: 'asc' }, take: 6 }),
        db.alert.count({ where: { readAt: null } }),
      ]);
    const review = ruleRegistry.reviewSummary();
    return {
      snapshot: {
        id: snapshot.id, aactVersion: snapshot.aactVersion, source: snapshot.source, area: snapshot.area,
        fetchedAt: snapshot.fetchedAt, checksum: snapshot.checksum, studyCount: snapshot.studyCount,
      },
      counts: {
        trials, terminatedTrials: terminated, effectRecords: records, mappedRecords: mapped, candidatePairs: edges,
        passedPairs: passed, failedPairs: edges - passed, apparentConflicts: apparent, apparentConflictsDissolved: dissolved,
        contradictions, clusters, unreadAlerts: unread,
        byType: Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5'].map((t) => [t, byType.find((b) => b.type === t)?._count ?? 0])),
      },
      failuresByDimension: GATE_DIMENSIONS.map((d) => ({
        dimension: d, label: DIMENSION_LABEL[d], count: weakest.find((w) => w.weakestDimension === d)?._count ?? 0,
      })),
      top: top.map(contradictionSummary),
      ruleSet: { version: ruleRegistry.version, rulesTotal: review.total, rulesReviewed: review.reviewed },
      gates: await phaseGates(snapshot.id, snapshot.source),
    };
  });

  app.get('/v1/snapshots', async () => {
    const snapshots = await db.snapshot.findMany({ orderBy: { createdAt: 'desc' } });
    const deltas = await db.snapshotDelta.groupBy({ by: ['snapshotId', 'kind'], _count: true });
    return snapshots.map((s) => ({
      id: s.id, aactVersion: s.aactVersion, source: s.source, area: s.area, fetchedAt: s.fetchedAt, checksum: s.checksum,
      studyCount: s.studyCount, previousId: s.previousId,
      delta: Object.fromEntries(['ADDED', 'CHANGED', 'REMOVED'].map((k) => [k.toLowerCase(), deltas.find((d) => d.snapshotId === s.id && d.kind === k)?._count ?? 0])),
    }));
  });

  app.get('/v1/rules', async () => ({ version: ruleRegistry.version, review: ruleRegistry.reviewSummary(), rules: ruleRegistry.list() }));

  app.get('/v1/pipeline', async (req) => {
    const snapshot = await snapshotFor(req.query as { snapshot?: string });
    const runs = await db.pipelineRun.findMany({ where: { snapshotId: snapshot.id }, orderBy: { startedAt: 'desc' } });
    const seen = new Set<string>();
    return {
      gates: await phaseGates(snapshot.id, snapshot.source),
      runs: runs.filter((r) => (seen.has(r.step) ? false : (seen.add(r.step), true))).map((r) => ({
        step: r.step, ruleVersion: r.ruleVersion, startedAt: r.startedAt, finishedAt: r.finishedAt, stats: r.stats,
      })),
    };
  });
}
