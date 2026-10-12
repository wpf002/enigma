import type {} from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';
import { agentLabel, db, effectOf, endpointLabel, iso, num, snapshotFor } from '../util.js';

/** Contradiction map: clusters of trials joined by gate-pass edges. Failed pairs are never drawn here. */
export async function mapRoutes(app: FastifyInstance) {
  app.get('/v1/map', async (req) => {
    const q = req.query as { snapshot?: string; endpoint?: string; agent?: string; limit?: string };
    const snapshot = await snapshotFor(q);
    const where = { snapshotId: snapshot.id };
    const all = await db.cluster.findMany({ where, select: { id: true, endpointNodeId: true, agents: true, k: true } });
    const counts = await db.contradiction.groupBy({ by: ['clusterId'], where: { ...where, clusterId: { not: null } }, _count: true, _max: { diagnosticValue: true } });
    const countBy = new Map(counts.map((c) => [c.clusterId!, { n: c._count, max: num(c._max.diagnosticValue) ?? 0 }]));

    const endpoints = new Map<string, { id: string; label: string; clusters: number; contradictions: number }>();
    for (const c of all) {
      const e = endpoints.get(c.endpointNodeId) ?? { id: c.endpointNodeId, label: endpointLabel(c.endpointNodeId), clusters: 0, contradictions: 0 };
      e.clusters += 1;
      e.contradictions += countBy.get(c.id)?.n ?? 0;
      endpoints.set(c.endpointNodeId, e);
    }

    const limit = Math.min(Number(q.limit ?? 36) || 36, 120);
    const picked = all
      .filter((c) => (!q.endpoint || c.endpointNodeId === q.endpoint) && (!q.agent || c.agents.includes(q.agent)))
      .sort((x, y) => (countBy.get(y.id)?.n ?? 0) - (countBy.get(x.id)?.n ?? 0) || y.k - x.k || x.id.localeCompare(y.id))
      .slice(0, limit)
      .map((c) => c.id);

    const [clusters, edges, contradictions] = await Promise.all([
      db.cluster.findMany({ where: { id: { in: picked } } }),
      db.comparabilityEdge.findMany({
        where: { clusterId: { in: picked }, passed: true },
        select: { id: true, clusterId: true, aNctId: true, bNctId: true, gateScore: true, weakestDimension: true },
      }),
      db.contradiction.findMany({ where: { clusterId: { in: picked } }, select: { id: true, edgeId: true, clusterId: true, type: true, rank: true, nctIds: true, diagnosticValue: true } }),
    ]);
    const records = await db.effectRecord.findMany({
      where: { id: { in: clusters.flatMap((c) => c.memberIds) } },
      select: { id: true, nctId: true, measure: true, value: true, ciLow: true, ciHigh: true, ciLevel: true, nAnalyzed: true, experimentalLabel: true, units: true },
    });
    const trials = await db.trial.findMany({
      where: { snapshotId: snapshot.id, nctId: { in: [...new Set(edges.flatMap((e) => [e.aNctId, e.bNctId]))] } },
      select: { nctId: true, acronym: true, title: true, status: true, stopCategory: true, completionDate: true, enrollment: true },
    });
    const trialBy = new Map(trials.map((t) => [t.nctId, t]));
    const recordBy = new Map(records.map((r) => [r.id, r]));
    const byEdge = new Map(contradictions.filter((c) => c.edgeId).map((c) => [c.edgeId!, c]));

    return {
      endpoints: [...endpoints.values()].sort((a, b) => b.contradictions - a.contradictions || b.clusters - a.clusters),
      totalClusters: all.length,
      clusters: picked.map((id) => {
        const c = clusters.find((x) => x.id === id)!;
        const own = edges.filter((e) => e.clusterId === id);
        // one link per trial pair: lowest gate score, best-ranked contradiction
        const links = new Map<string, { source: string; target: string; gateScore: number; edges: number; contradiction: { id: string; type: string; rank: number | null } | null }>();
        for (const e of own) {
          const [source, target] = [e.aNctId, e.bNctId].sort() as [string, string];
          const key = `${source}|${target}`;
          const hit = byEdge.get(e.id);
          const link = links.get(key) ?? { source, target, gateScore: 1, edges: 0, contradiction: null };
          link.edges += 1;
          link.gateScore = Math.min(link.gateScore, num(e.gateScore) ?? 0);
          if (hit && (!link.contradiction || (hit.rank ?? 1e9) < (link.contradiction.rank ?? 1e9))) link.contradiction = { id: hit.id, type: hit.type, rank: hit.rank };
          links.set(key, link);
        }
        const rep = new Map(c.memberIds.map((rid) => recordBy.get(rid)).filter((r) => r !== undefined).map((r) => [r.nctId, r]));
        const ncts = [...new Set(own.flatMap((e) => [e.aNctId, e.bNctId]))].sort();
        const stats = c.stats as { pooled?: { i2: number; thetaRandom: number; ciLow: number; ciHigh: number; q: number; df: number } | null };
        return {
          id: c.id,
          label: c.label,
          endpoint: { id: c.endpointNodeId, label: endpointLabel(c.endpointNodeId) },
          agents: c.agents.map((a) => ({ id: a, label: agentLabel(a) })),
          comparatorClass: c.comparatorClass,
          measure: c.measure,
          k: c.k,
          nPatients: c.nPatients,
          density: num(c.density),
          minGateScore: num(c.minGateScore),
          i2: stats.pooled?.i2 ?? null,
          contradictionCount: countBy.get(id)?.n ?? 0,
          clusterFindings: contradictions.filter((x) => x.clusterId === id && !x.edgeId).map((x) => ({ id: x.id, type: x.type, rank: x.rank })),
          nodes: ncts.map((nct) => {
            const t = trialBy.get(nct);
            const r = rep.get(nct);
            return {
              id: nct, label: t?.acronym ?? nct, title: t?.title ?? nct, status: t?.status ?? null, stopCategory: t?.stopCategory ?? null,
              completionDate: iso(t?.completionDate), enrollment: t?.enrollment ?? null,
              effect: r ? { ...effectOf(r), arm: r.experimentalLabel, n: r.nAnalyzed } : null,
            };
          }),
          links: [...links.values()],
        };
      }),
    };
  });
}
