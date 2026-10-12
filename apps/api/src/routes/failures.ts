import type {} from '@fastify/sensible';
import { DIMENSION_LABEL, FAILURE_REASONS, GATE_DIMENSIONS, type FailureReason, type GateDimension } from '@enigma/core';
import type { Prisma } from '@enigma/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agentLabel, db, effectOf, endpointLabel, num, snapshotFor } from '../util.js';

const listQuery = z.object({
  snapshot: z.string().optional(),
  dimension: z.string().optional(),
  reason: z.string().optional(),
  endpoint: z.string().optional(),
  trial: z.string().optional(),
  apparent: z.enum(['true', 'false', 'any']).default('true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const RECORD = {
  id: true, nctId: true, outcomeTitle: true, classification: true, endpointNodeId: true, measure: true, value: true, ciLow: true, ciHigh: true,
  ciLevel: true, units: true, experimentalLabel: true, comparatorLabel: true, agents: true, doseDaily: true, doseUnit: true, comparatorClass: true,
  timepointDays: true, analysisPopulation: true, nAnalyzed: true, sourceKind: true,
} as const;

type Rec = Prisma.EffectRecordGetPayload<{ select: typeof RECORD }>;

const recordCard = (r: Rec | undefined, acronym: string | null | undefined) =>
  r && {
    id: r.id, nctId: r.nctId, label: acronym ?? r.nctId, outcomeTitle: r.outcomeTitle, classification: r.classification,
    endpoint: { id: r.endpointNodeId, label: endpointLabel(r.endpointNodeId) }, effect: effectOf(r), units: r.units,
    arm: r.experimentalLabel, comparator: r.comparatorLabel, agents: r.agents.map(agentLabel), doseDaily: num(r.doseDaily), doseUnit: r.doseUnit,
    comparatorClass: r.comparatorClass, timepointDays: r.timepointDays, analysisPopulation: r.analysisPopulation, n: r.nAnalyzed, sourceKind: r.sourceKind,
  };

/** Comparability failures. A failed pair is a record with reasons, and is surfaced as a product (roadmap §2.2). */
export async function failureRoutes(app: FastifyInstance) {
  app.get('/v1/failures', async (req) => {
    const q = listQuery.parse(req.query);
    const snapshot = await snapshotFor(q);
    const base: Prisma.ComparabilityEdgeWhereInput = { snapshotId: snapshot.id, passed: false };
    const where: Prisma.ComparabilityEdgeWhereInput = { ...base };
    if (q.apparent !== 'any') where.apparentConflict = q.apparent === 'true';
    if (q.dimension) where.weakestDimension = q.dimension;
    if (q.reason) where.failureReasons = { path: [], string_contains: q.reason };
    if (q.trial) where.OR = [{ aNctId: q.trial.toUpperCase() }, { bNctId: q.trial.toUpperCase() }];
    if (q.endpoint) where.blockKey = { startsWith: `${q.endpoint}|` };

    const [total, items, byDimension, apparentByDimension, groups] = await Promise.all([
      db.comparabilityEdge.count({ where }),
      db.comparabilityEdge.findMany({
        where, orderBy: [{ gateScore: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: { id: true, aId: true, bId: true, aNctId: true, bNctId: true, gateScore: true, weakestDimension: true, dimensionScores: true, failureReasons: true, apparentConflict: true, blockKey: true },
      }),
      db.comparabilityEdge.groupBy({ by: ['weakestDimension'], where: base, _count: true }),
      db.comparabilityEdge.groupBy({ by: ['weakestDimension'], where: { ...base, apparentConflict: true }, _count: true }),
      // blocks where the most pairs look contradictory and were stopped
      db.comparabilityEdge.groupBy({
        by: ['blockKey', 'weakestDimension'], where: { ...base, apparentConflict: true }, _count: true,
        orderBy: { _count: { blockKey: 'desc' } }, take: 12,
      }),
    ]);
    const records = new Map((await db.effectRecord.findMany({ where: { id: { in: items.flatMap((e) => [e.aId, e.bId]) } }, select: RECORD })).map((r) => [r.id, r]));
    const trials = new Map((await db.trial.findMany({ where: { snapshotId: snapshot.id, nctId: { in: items.flatMap((e) => [e.aNctId, e.bNctId]) } }, select: { nctId: true, acronym: true } })).map((t) => [t.nctId, t.acronym]));

    return {
      total, page: q.page, pageSize: q.pageSize,
      summary: {
        failed: byDimension.reduce((a, d) => a + d._count, 0),
        apparentDissolved: apparentByDimension.reduce((a, d) => a + d._count, 0),
        byDimension: GATE_DIMENSIONS.map((d) => ({
          dimension: d, label: DIMENSION_LABEL[d],
          failed: byDimension.find((x) => x.weakestDimension === d)?._count ?? 0,
          apparentDissolved: apparentByDimension.find((x) => x.weakestDimension === d)?._count ?? 0,
        })),
        groups: groups.map((g) => {
          const [group, intervention] = g.blockKey.split('|') as [string, string];
          const ids = (intervention ?? '').replace(/^(agent|class):/, '');
          return {
            blockKey: g.blockKey, endpoint: { id: group, label: endpointLabel(group) },
            intervention: intervention?.startsWith('class:') ? `${ids} class` : ids.split('+').map(agentLabel).join(' + '),
            dimension: g.weakestDimension, dimensionLabel: DIMENSION_LABEL[g.weakestDimension as GateDimension] ?? g.weakestDimension, pairs: g._count,
          };
        }),
        reasons: FAILURE_REASONS,
      },
      items: items.map((e) => ({
        id: e.id, gateScore: num(e.gateScore), weakestDimension: e.weakestDimension,
        weakestLabel: DIMENSION_LABEL[e.weakestDimension as GateDimension] ?? e.weakestDimension,
        dimensionScores: e.dimensionScores, apparentConflict: e.apparentConflict,
        failureReasons: Object.entries(e.failureReasons as Record<string, string>).map(([dimension, reason]) => ({
          dimension, label: DIMENSION_LABEL[dimension as GateDimension] ?? dimension, reason, text: FAILURE_REASONS[reason as FailureReason] ?? reason,
        })),
        a: recordCard(records.get(e.aId), trials.get(e.aNctId)),
        b: recordCard(records.get(e.bId), trials.get(e.bNctId)),
      })),
    };
  });

  app.get('/v1/failures/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = await db.comparabilityEdge.findUnique({ where: { id } });
    if (!e) return reply.notFound('edge not found');
    const records = await db.effectRecord.findMany({ where: { id: { in: [e.aId, e.bId] } }, select: RECORD });
    const trials = await db.trial.findMany({ where: { snapshotId: e.snapshotId, nctId: { in: [e.aNctId, e.bNctId] } }, select: { nctId: true, acronym: true } });
    const acronym = (n: string) => trials.find((t) => t.nctId === n)?.acronym;
    return {
      id: e.id, passed: e.passed, gateScore: num(e.gateScore), weakestDimension: e.weakestDimension, dimensionScores: e.dimensionScores,
      failureReasons: e.failureReasons, apparentConflict: e.apparentConflict, factors: e.factors, ruleVersion: e.ruleVersion,
      a: recordCard(records.find((r) => r.id === e.aId), acronym(e.aNctId)),
      b: recordCard(records.find((r) => r.id === e.bId), acronym(e.bNctId)),
    };
  });
}
