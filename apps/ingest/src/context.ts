import { getDb } from '@enigma/db';

/** Steps run against the newest snapshot unless one is named. */
export async function resolveSnapshotId(explicit?: string): Promise<string> {
  const db = getDb();
  if (explicit) {
    const found = await db.snapshot.findFirst({ where: { OR: [{ id: explicit }, { aactVersion: explicit }] } });
    if (!found) throw new Error(`snapshot not found: ${explicit}`);
    return found.id;
  }
  const latest = await db.snapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!latest) throw new Error('no snapshot yet: run `pnpm ingest snapshot` first');
  return latest.id;
}

export const STEPS = ['normalize', 'harmonize', 'gate', 'contradict', 'rank', 'dossier'] as const;
export type Step = (typeof STEPS)[number];

/**
 * Deletes the derived rows a step produces, and everything downstream of it.
 * The raw layer is never touched. Derived layers are rebuilt from raw + rules.
 */
export async function clearDerived(snapshotId: string, from: Step): Promise<void> {
  const db = getDb();
  const at = STEPS.indexOf(from);
  const where = { snapshotId };
  if (at <= STEPS.indexOf('dossier')) await db.dossier.deleteMany({ where });
  if (at <= STEPS.indexOf('contradict')) {
    await db.contradiction.deleteMany({ where });
    await db.cluster.deleteMany({ where });
  }
  if (at <= STEPS.indexOf('gate')) await db.comparabilityEdge.deleteMany({ where });
  if (at <= STEPS.indexOf('normalize')) {
    await db.effectRecord.deleteMany({ where });
    await db.normalizationFailure.deleteMany({ where });
    await db.trial.deleteMany({ where });
  }
}

export async function recordRun(snapshotId: string, step: string, ruleVersion: string, stats: object, startedAt: Date): Promise<void> {
  await getDb().pipelineRun.create({
    data: { snapshotId, step, ruleVersion, stats, startedAt, finishedAt: new Date() },
  });
}
