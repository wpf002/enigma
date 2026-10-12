// Phase 6: alerts on new AACT deltas. Compares the snapshot with its predecessor
// and writes one alert per watchlist per trial change or new contradiction.
import { getDb, type Prisma } from '@enigma/db';
import { createLogger } from '@enigma/shared';
import { recordRun } from '../context.js';

const log = createLogger('alerts');

/** A contradiction is the same finding across snapshots when its type, endpoint and trials match. */
const signature = (c: { type: string; endpointNodeId: string; nctIds: string[] }) => `${c.type}|${c.endpointNodeId}|${[...c.nctIds].sort().join(',')}`;

export async function runAlerts(snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const snapshot = await db.snapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const watchlists = await db.watchlist.findMany();
  if (!snapshot.previousId) {
    log.info('first snapshot: nothing to compare against, no alerts');
    await recordRun(snapshotId, 'alerts', 'n/a', { alerts: 0, reason: 'first snapshot' }, startedAt);
    return;
  }
  if (watchlists.length === 0) {
    await recordRun(snapshotId, 'alerts', 'n/a', { alerts: 0, reason: 'no watchlists' }, startedAt);
    return;
  }
  await db.alert.deleteMany({ where: { snapshotId } });

  const deltas = await db.snapshotDelta.findMany({ where: { snapshotId, kind: { in: ['ADDED', 'CHANGED', 'REMOVED'] } } });
  const changed = deltas.map((d) => d.nctId);
  // what each changed trial touches, in this snapshot (or the previous one, for removed trials)
  const records = await db.effectRecord.findMany({
    where: { snapshotId: { in: [snapshotId, snapshot.previousId] }, nctId: { in: changed } },
    select: { nctId: true, agents: true, endpointNodeId: true },
  });
  const touches = new Map<string, { agents: Set<string>; endpoints: Set<string> }>();
  for (const r of records) {
    const t = touches.get(r.nctId) ?? { agents: new Set<string>(), endpoints: new Set<string>() };
    for (const a of r.agents) t.agents.add(a);
    if (r.endpointNodeId) t.endpoints.add(r.endpointNodeId);
    touches.set(r.nctId, t);
  }
  const titles = new Map(
    (await db.trial.findMany({ where: { snapshotId: { in: [snapshotId, snapshot.previousId] }, nctId: { in: changed } }, select: { nctId: true, title: true, acronym: true } }))
      .map((t) => [t.nctId, t.acronym ?? t.title]),
  );

  const [current, previous] = await Promise.all([
    db.contradiction.findMany({ where: { snapshotId }, select: { id: true, type: true, endpointNodeId: true, nctIds: true, agents: true, rank: true, diagnosticValue: true } }),
    db.contradiction.findMany({ where: { snapshotId: snapshot.previousId }, select: { type: true, endpointNodeId: true, nctIds: true } }),
  ]);
  const known = new Set(previous.map(signature));
  const fresh = current.filter((c) => !known.has(signature(c)));

  const alerts: Prisma.AlertCreateManyInput[] = [];
  for (const w of watchlists) {
    for (const d of deltas) {
      const t = touches.get(d.nctId);
      const match = w.kind === 'TRIAL' ? d.nctId === w.value : w.kind === 'AGENT' ? t?.agents.has(w.value) : t?.endpoints.has(w.value);
      if (!match) continue;
      const verb = d.kind === 'ADDED' ? 'posted results' : d.kind === 'CHANGED' ? 'changed its posted results' : 'is no longer in scope';
      alerts.push({
        watchlistId: w.id, snapshotId, kind: `TRIAL_${d.kind}`,
        title: `${titles.get(d.nctId) ?? d.nctId} (${d.nctId}) ${verb}`,
        detail: { nctId: d.nctId, previousHash: d.previousHash, currentHash: d.currentHash },
      });
    }
    for (const c of fresh) {
      const match = w.kind === 'TRIAL' ? c.nctIds.includes(w.value) : w.kind === 'AGENT' ? c.agents.includes(w.value) : c.endpointNodeId === w.value;
      if (!match) continue;
      alerts.push({
        watchlistId: w.id, snapshotId, kind: 'NEW_CONTRADICTION',
        title: `New ${c.type} contradiction on ${c.endpointNodeId} (${c.nctIds.join(', ')})`,
        detail: { contradictionId: c.id, rank: c.rank, diagnosticValue: c.diagnosticValue.toNumber(), nctIds: c.nctIds },
      });
    }
  }
  if (alerts.length) await db.alert.createMany({ data: alerts });
  const stats = { alerts: alerts.length, deltas: deltas.length, newContradictions: fresh.length, watchlists: watchlists.length };
  await recordRun(snapshotId, 'alerts', 'n/a', stats, startedAt);
  log.info('alerts complete', stats);
}
