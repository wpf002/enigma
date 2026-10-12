// Phase 4 exit gate: on 20 documented controversies, Enigma should surface >= 12
// without seeding. The fixture is only read here, after the pipeline has run.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDb } from '@enigma/db';
import { endpointGroup } from '@enigma/harmonize';
import { createLogger } from '@enigma/shared';
import { recordRun } from '../context.js';

const log = createLogger('controversy-eval');

interface Controversy {
  id: string;
  title: string;
  agents: string[];
  agentClasses: string[];
  nctIds: string[];
  endpointNodeIds: string[];
}

export async function runControversyEval(snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const path = fileURLToPath(new URL('../../../../fixtures/controversies.json', import.meta.url));
  const { controversies } = JSON.parse(await readFile(path, 'utf8')) as { controversies: Controversy[] };
  const contradictions = await db.contradiction.findMany({
    where: { snapshotId },
    select: { id: true, type: true, endpointNodeId: true, agents: true, agentClass: true, nctIds: true, rank: true },
  });

  const results = [];
  for (const c of controversies) {
    const endpoints = new Set(c.endpointNodeIds);
    const inScope = (endpoint: string, agents: string[], agentClass: string | null, nctIds: string[]) =>
      (endpoints.has(endpoint) || endpoints.has(endpointGroup(endpoint))) &&
      (agents.some((a) => c.agents.includes(a)) || (agentClass !== null && c.agentClasses.includes(agentClass)) ||
        (c.agents.length === 0 && c.agentClasses.length === 0 && nctIds.some((n) => c.nctIds.includes(n))));
    const hits = contradictions.filter((x) => inScope(x.endpointNodeId, x.agents, x.agentClass, x.nctIds));
    // A hit that involves one of the controversy's own trials is the controversy itself.
    const direct = hits.filter((x) => x.nctIds.some((n) => c.nctIds.includes(n)));

    // Pairs among the named trials that look contradictory and were stopped by the gate.
    const dissolved = c.nctIds.length >= 2
      ? await db.comparabilityEdge.groupBy({
          by: ['weakestDimension'],
          where: { snapshotId, passed: false, apparentConflict: true, aNctId: { in: c.nctIds }, bNctId: { in: c.nctIds } },
          _count: true,
        })
      : [];
    results.push({
      id: c.id,
      inOntology: c.endpointNodeIds.length > 0,
      surfaced: direct.length > 0,
      contradictionsInvolvingNamedTrials: direct.length,
      contradictionsInScope: hits.length,
      bestRank: direct.reduce<number | null>((best, x) => (x.rank !== null && (best === null || x.rank < best) ? x.rank : best), null),
      apparentConflictsStoppedByGate: Object.fromEntries(dissolved.map((d) => [d.weakestDimension, d._count])),
    });
  }
  const surfaced = results.filter((r) => r.surfaced).length;
  const summary = { listed: controversies.length, required: 20, surfaced, target: 12, met: controversies.length >= 20 && surfaced >= 12 };
  await recordRun(snapshotId, 'controversy-eval', 'n/a', { summary, results }, startedAt);
  for (const r of results) log.info('controversy', r);
  log.info('summary', summary);
}
