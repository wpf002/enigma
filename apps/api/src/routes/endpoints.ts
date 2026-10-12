import type {} from '@fastify/sensible';
import { ENDPOINT_BY_ID, endpointPath } from '@enigma/harmonize';
import type { FastifyInstance } from 'fastify';
import { agentLabel, contradictionSummary, db, effectOf, endpointLabel, iso, snapshotFor } from '../util.js';

export async function endpointRoutes(app: FastifyInstance) {
  app.get('/v1/endpoints', async (req) => {
    const snapshot = await snapshotFor(req.query as { snapshot?: string });
    const where = { snapshotId: snapshot.id };
    const [nodes, records, trials, contradictions, clusters] = await Promise.all([
      db.endpointNode.findMany({ orderBy: [{ family: 'asc' }, { depth: 'asc' }, { id: 'asc' }] }),
      db.effectRecord.groupBy({ by: ['endpointNodeId'], where: { ...where, endpointNodeId: { not: null } }, _count: true }),
      db.$queryRaw<{ id: string; trials: bigint }[]>`
        SELECT "endpointNodeId" AS id, count(DISTINCT "nctId") AS trials FROM "EffectRecord"
         WHERE "snapshotId" = ${snapshot.id} AND "endpointNodeId" IS NOT NULL GROUP BY 1`,
      db.contradiction.groupBy({ by: ['endpointNodeId'], where, _count: true }),
      db.cluster.groupBy({ by: ['endpointNodeId'], where, _count: true }),
    ]);
    const count = <T extends { _count: number }>(rows: (T & { endpointNodeId: string | null })[], id: string) => rows.find((r) => r.endpointNodeId === id)?._count ?? 0;
    return nodes.map((n) => ({
      id: n.id, parentId: n.parentId, label: n.label, family: n.family, depth: n.depth, lowerIsBetter: n.lowerIsBetter,
      abstract: ENDPOINT_BY_ID.get(n.id)?.kind === null,
      meshTerms: n.meshTerms,
      records: count(records, n.id),
      trials: Number(trials.find((t) => t.id === n.id)?.trials ?? 0),
      clusters: count(clusters, n.id),
      contradictions: count(contradictions, n.id),
    }));
  });

  /** Evidence timeline: one point per trial comparison, by completion date, plus the cumulative pooled estimate of each cluster. */
  app.get('/v1/endpoints/:id/timeline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { snapshot?: string; agent?: string; measure?: string };
    const node = await db.endpointNode.findUnique({ where: { id } });
    if (!node) return reply.notFound('endpoint not found');
    const snapshot = await snapshotFor(q);
    const base = { snapshotId: snapshot.id, endpointNodeId: id, interventionHash: { not: null }, directionResolved: true };

    const facets = await db.effectRecord.groupBy({ by: ['interventionHash', 'measure'], where: base, _count: true });
    const agentCounts = new Map<string, number>();
    for (const f of facets) agentCounts.set(f.interventionHash!, (agentCounts.get(f.interventionHash!) ?? 0) + f._count);
    const agents = [...agentCounts.entries()].sort((a, b) => b[1] - a[1]).map(([hash, records]) => ({ id: hash, label: hash.split('+').map(agentLabel).join(' + '), records }));
    const agent = q.agent ?? agents[0]?.id ?? null;
    const measures = facets.filter((f) => f.interventionHash === agent).sort((a, b) => b._count - a._count).map((f) => ({ id: f.measure, records: f._count }));
    const measure = q.measure ?? measures[0]?.id ?? null;

    const records = agent && measure
      ? await db.effectRecord.findMany({ where: { ...base, interventionHash: agent, measure }, include: { trial: true }, orderBy: { timepointDays: 'desc' } })
      : [];
    // one point per trial comparison: the longest follow-up, posted analyses first
    const series = new Map<string, (typeof records)[number]>();
    for (const r of records) {
      const key = `${r.nctId}|${r.experimentalLabel}|${r.comparatorLabel}`;
      const current = series.get(key);
      if (!current || (current.sourceKind !== 'ANALYSIS' && r.sourceKind === 'ANALYSIS' && r.timepointDays === current.timepointDays)) series.set(key, r);
    }
    const points = [...series.values()].map((r) => ({
      recordId: r.id, nctId: r.nctId, label: r.trial.acronym ?? r.nctId, title: r.trial.title, arm: r.experimentalLabel, comparator: r.comparatorLabel,
      comparatorClass: r.comparatorClass, date: iso(r.trial.completionDate), status: r.trial.status, stopCategory: r.trial.stopCategory,
      effect: effectOf(r), units: r.units, n: r.nAnalyzed, timepointDays: r.timepointDays, sourceKind: r.sourceKind, doseDaily: r.doseDaily?.toNumber() ?? null, doseUnit: r.doseUnit,
    })).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.nctId.localeCompare(b.nctId));

    const clusters = agent
      ? await db.cluster.findMany({ where: { snapshotId: snapshot.id, endpointNodeId: id, agents: { equals: agent.split('+') }, ...(measure ? { measure } : {}) }, orderBy: { k: 'desc' } })
      : [];
    const contradictions = agent
      ? await db.contradiction.findMany({ where: { snapshotId: snapshot.id, endpointNodeId: id, agents: { equals: agent.split('+') } }, orderBy: { rank: 'asc' }, take: 40 })
      : [];
    return {
      endpoint: { id: node.id, label: node.label, family: node.family, lowerIsBetter: node.lowerIsBetter, path: endpointPath(node.id).map((p) => ({ id: p, label: endpointLabel(p) })) },
      agents, agent, measures, measure,
      points,
      clusters: clusters.map((c) => ({ id: c.id, label: c.label, k: c.k, nPatients: c.nPatients, comparatorClass: c.comparatorClass, nctIds: c.nctIds, stats: c.stats })),
      contradictions: contradictions.map(contradictionSummary),
    };
  });
}
