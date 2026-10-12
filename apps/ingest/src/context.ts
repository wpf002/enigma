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
