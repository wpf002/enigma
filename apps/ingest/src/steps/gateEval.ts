// Phase 3 exit gate: on a review with a known included-studies list, the gate
// should recover >= 85% of the included pairs and reject >= 90% of excluded ones.
import { getDb } from '@enigma/db';
import { createLogger, loadConfig } from '@enigma/shared';
import { recordRun } from '../context.js';
import { loadReviews } from '../reviews.js';

const log = createLogger('gate-eval');

export async function runGateEval(snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const threshold = loadConfig().COMPARABILITY_GATE_THRESHOLD;
  const results = [];

  for (const review of await loadReviews()) {
    if (review.includedNctIds.length < 2) {
      results.push({ review: review.id, evaluated: false, reason: 'fewer than two included studies listed' });
      continue;
    }
    const nodeRecords = await db.effectRecord.findMany({
      where: { snapshotId, endpointNodeId: { in: review.endpointNodeIds } },
      select: { id: true },
    });
    const ids = new Set(nodeRecords.map((r) => r.id));
    const both = await db.comparabilityEdge.findMany({
      where: { snapshotId, aNctId: { in: review.includedNctIds }, bNctId: { in: review.includedNctIds } },
      select: { aId: true, bId: true, aNctId: true, bNctId: true, passed: true, dimensionScores: true, failureReasons: true },
    });
    // one verdict per trial pair: recovered if any of its endpoint-matched edges passes
    const pairs = new Map<string, { strict: boolean; pooled: boolean }>();
    for (const e of both) {
      if (!ids.has(e.aId) || !ids.has(e.bId)) continue;
      const scores = e.dimensionScores as Record<string, number>;
      const reasons = e.failureReasons as Record<string, string>;
      // A class-level review pools different agents. Count the pair as recovered at the review's
      // own pooling level when the only failure is "different agent of the same class".
      const others = Object.entries(scores).filter(([d]) => d !== 'intervention').every(([, s]) => s >= threshold);
      const pooled = e.passed || (review.pooling === 'AGENT_CLASS' && others && reasons.intervention === 'INTERVENTION_DIFFERENT_AGENT');
      const key = [e.aNctId, e.bNctId].sort().join('|');
      const prev = pairs.get(key) ?? { strict: false, pooled: false };
      pairs.set(key, { strict: prev.strict || e.passed, pooled: prev.pooled || pooled });
    }
    const n = review.includedNctIds.length;
    const possible = (n * (n - 1)) / 2;
    const verdicts = [...pairs.values()];

    let excluded: Record<string, unknown> = { evaluated: false, reason: 'fixture lists no excluded studies' };
    if (review.excludedNctIds.length > 0) {
      const mixed = await db.comparabilityEdge.findMany({
        where: {
          snapshotId,
          OR: [
            { aNctId: { in: review.includedNctIds }, bNctId: { in: review.excludedNctIds } },
            { aNctId: { in: review.excludedNctIds }, bNctId: { in: review.includedNctIds } },
          ],
        },
        select: { aId: true, bId: true, passed: true },
      });
      const scoped = mixed.filter((e) => ids.has(e.aId) && ids.has(e.bId));
      excluded = { evaluated: true, pairs: scoped.length, rejected: scoped.filter((e) => !e.passed).length,
        rejectionRate: scoped.length ? scoped.filter((e) => !e.passed).length / scoped.length : null, target: 0.9 };
    }
    results.push({
      review: review.id,
      evaluated: true,
      pooling: review.pooling,
      includedStudies: n,
      includedPairsPossible: possible,
      includedPairsWithCandidateEdge: verdicts.length,
      recoveredStrict: verdicts.filter((v) => v.strict).length,
      recoveredAtReviewPooling: verdicts.filter((v) => v.pooled).length,
      recoveryStrict: possible ? verdicts.filter((v) => v.strict).length / possible : 0,
      recoveryAtReviewPooling: possible ? verdicts.filter((v) => v.pooled).length / possible : 0,
      target: 0.85,
      excluded,
    });
  }
  await recordRun(snapshotId, 'gate-eval', 'n/a', { results }, startedAt);
  for (const r of results) log.info('review', r);
}
