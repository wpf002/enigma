import type {} from '@fastify/sensible';
import { AGENTS, ENDPOINTS } from '@enigma/harmonize';
import type { FastifyInstance } from 'fastify';
import { agentLabel, contradictionSummary, db, effectOf, endpointLabel, iso, num, snapshotFor } from '../util.js';

export async function trialRoutes(app: FastifyInstance) {
  app.get('/v1/trials/:nctId', async (req, reply) => {
    const nctId = (req.params as { nctId: string }).nctId.toUpperCase();
    const snapshot = await snapshotFor(req.query as { snapshot?: string });
    const trial = await db.trial.findUnique({ where: { snapshotId_nctId: { snapshotId: snapshot.id, nctId } } });
    if (!trial) return reply.notFound('trial not in this snapshot');
    const [records, contradictions, passed, failed, unmapped] = await Promise.all([
      db.effectRecord.findMany({ where: { trialId: trial.id, endpointNodeId: { not: null } }, orderBy: [{ endpointNodeId: 'asc' }, { timepointDays: 'asc' }] }),
      db.contradiction.findMany({ where: { snapshotId: snapshot.id, nctIds: { has: nctId } }, orderBy: { rank: 'asc' } }),
      db.comparabilityEdge.count({ where: { snapshotId: snapshot.id, passed: true, OR: [{ aNctId: nctId }, { bNctId: nctId }] } }),
      db.comparabilityEdge.groupBy({ by: ['weakestDimension'], where: { snapshotId: snapshot.id, passed: false, OR: [{ aNctId: nctId }, { bNctId: nctId }] }, _count: true }),
      db.effectRecord.count({ where: { trialId: trial.id, endpointNodeId: null } }),
    ]);
    return {
      nctId, title: trial.title, acronym: trial.acronym, status: trial.status, phase: trial.phase, enrollment: trial.enrollment,
      startDate: iso(trial.startDate), completionDate: iso(trial.completionDate), resultsPostedDate: iso(trial.resultsPostedDate),
      sponsor: trial.sponsor, sponsorClass: trial.sponsorClass, allocation: trial.allocation, masking: trial.masking,
      whyStopped: trial.whyStopped, stopCategory: trial.stopCategory, population: trial.population, arms: trial.arms,
      registryUrl: `https://clinicaltrials.gov/study/${nctId}`,
      records: records.map((r) => ({
        id: r.id, endpoint: { id: r.endpointNodeId, label: endpointLabel(r.endpointNodeId) }, outcomeTitle: r.outcomeTitle, classification: r.classification,
        effect: effectOf(r), units: r.units, arm: r.experimentalLabel, comparator: r.comparatorLabel, agents: r.agents.map(agentLabel),
        comparatorClass: r.comparatorClass, timepointDays: r.timepointDays, analysisPopulation: r.analysisPopulation, n: r.nAnalyzed,
        sourceKind: r.sourceKind, directionResolved: r.directionResolved, doseDaily: num(r.doseDaily), doseUnit: r.doseUnit,
      })),
      unmappedRecords: unmapped,
      gate: { passed, failedByDimension: Object.fromEntries(failed.map((f) => [f.weakestDimension, f._count])) },
      contradictions: contradictions.map(contradictionSummary),
    };
  });

  app.get('/v1/search', async (req) => {
    const q = req.query as { snapshot?: string; q?: string };
    const term = (q.q ?? '').trim();
    if (term.length < 2) return { trials: [], endpoints: [], agents: [], contradictions: [] };
    const snapshot = await snapshotFor(q);
    const lower = term.toLowerCase();
    const [trials, contradictions] = await Promise.all([
      db.trial.findMany({
        where: {
          snapshotId: snapshot.id,
          OR: [{ nctId: { contains: term, mode: 'insensitive' } }, { acronym: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }],
        },
        select: { nctId: true, acronym: true, title: true, status: true },
        take: 8,
      }),
      db.contradiction.findMany({
        where: {
          snapshotId: snapshot.id,
          OR: [{ nctIds: { has: term.toUpperCase() } }, { agents: { has: lower } }, { dossier: { is: { markdown: { contains: term, mode: 'insensitive' } } } }],
        },
        orderBy: { rank: 'asc' },
        take: 6,
      }),
    ]);
    return {
      trials,
      endpoints: ENDPOINTS.filter((e) => e.kind !== null && (e.label.toLowerCase().includes(lower) || e.id.includes(lower))).slice(0, 6).map((e) => ({ id: e.id, label: e.label, family: e.family })),
      agents: AGENTS.filter((a) => a.aliases.some((x) => x.includes(lower))).slice(0, 6).map((a) => ({ id: a.id, label: a.label, class: a.class })),
      contradictions: contradictions.map(contradictionSummary),
    };
  });
}
