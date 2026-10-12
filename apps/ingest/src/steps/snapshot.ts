// Phase 0: read the AACT `ctgov` schema, write the immutable raw layer, emit a
// Snapshot record and the per-trial delta against the previous snapshot.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getDb, type Prisma } from '@enigma/db';
import { chunk, createLogger, getArea, hashOf, type EnigmaConfig } from '@enigma/shared';
import { aactPool } from '../aact/client.js';

const log = createLogger('snapshot');

type Row = Record<string, unknown>;

/** Trial-level child tables copied verbatim into RawStudy.payload. */
const STUDY_TABLES = [
  'designs', 'eligibilities', 'conditions', 'browse_conditions', 'interventions',
  'intervention_other_names', 'browse_interventions', 'design_groups', 'design_group_interventions',
  'sponsors', 'result_groups', 'baseline_counts', 'baseline_measurements',
] as const;

async function tableExists(pool: pg.Pool, table: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'ctgov' AND table_name = $1",
    [table],
  );
  return res.rowCount === 1;
}

async function rowsFor(pool: pg.Pool, table: string, nctIds: string[]): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>();
  if (!(await tableExists(pool, table))) return out;
  const res = await pool.query(`SELECT * FROM ctgov.${table} WHERE nct_id = ANY($1) ORDER BY id`, [nctIds]);
  for (const row of res.rows as Row[]) {
    const nct = row.nct_id as string;
    const bucket = out.get(nct);
    if (bucket) bucket.push(row);
    else out.set(nct, [row]);
  }
  return out;
}

interface SnapshotIdentity {
  version: string;
  source: 'AACT_DUMP' | 'CTGOV_API_SUBSET';
  checksum: string;
  fetchedAt: Date;
}

/** Version and checksum come from the subset metadata, or from the dump restore record. */
async function identify(pool: pg.Pool, config: EnigmaConfig): Promise<SnapshotIdentity> {
  if (await tableExists(pool, 'enigma_subset_meta')) {
    const res = await pool.query('SELECT key, value FROM ctgov.enigma_subset_meta');
    const meta = Object.fromEntries(res.rows.map((r) => [r.key, r.value])) as Record<string, string>;
    if (meta.version && meta.checksum) {
      return {
        version: meta.version,
        source: 'CTGOV_API_SUBSET',
        checksum: meta.checksum,
        fetchedAt: new Date(meta.fetched_at ?? Date.now()),
      };
    }
  }
  const recordPath = fileURLToPath(new URL('../../../../infra/aact/last_restore.sha256', import.meta.url));
  const record = await readFile(recordPath, 'utf8').catch(() => '');
  const checksum = record.trim().split(/\s+/)[0];
  if (!checksum) {
    throw new Error(
      'no snapshot identity: run `pnpm aact:restore <dump>` or `pnpm aact:subset` before `pnpm ingest snapshot`',
    );
  }
  const version = config.AACT_SNAPSHOT_VERSION || `aact-${checksum.slice(0, 12)}`;
  return { version, source: 'AACT_DUMP', checksum, fetchedAt: new Date() };
}

/** Interventional, COMPLETED or TERMINATED, results posted, inside the therapeutic area. */
async function inScopeTrials(pool: pg.Pool, config: EnigmaConfig): Promise<string[]> {
  const area = getArea(config.THERAPEUTIC_AREA);
  const like = area.conditionPatterns.map((p) => `%${p}%`);
  const res = await pool.query(
    `SELECT s.nct_id
       FROM ctgov.studies s
      WHERE upper(s.study_type) = 'INTERVENTIONAL'
        AND upper(s.overall_status) IN ('COMPLETED', 'TERMINATED')
        AND s.results_first_submitted_date IS NOT NULL
        AND (
          s.nct_id = ANY($1)
          OR EXISTS (SELECT 1 FROM ctgov.browse_conditions b
                      WHERE b.nct_id = s.nct_id AND b.downcase_mesh_term = ANY($2))
          OR EXISTS (SELECT 1 FROM ctgov.conditions c
                      WHERE c.nct_id = s.nct_id AND c.downcase_name LIKE ANY($3))
        )
      ORDER BY s.nct_id`,
    [area.extraNctIds, area.meshTerms, like],
  );
  return res.rows.map((r) => r.nct_id as string);
}

export async function runSnapshot(config: EnigmaConfig): Promise<string> {
  const db = getDb();
  const pool = aactPool(config);
  try {
    const identity = await identify(pool, config);
    const existing = await db.snapshot.findUnique({ where: { aactVersion: identity.version } });
    if (existing) {
      log.info('snapshot already ingested, raw layer left untouched', { id: existing.id, version: identity.version });
      return existing.id;
    }

    const nctIds = await inScopeTrials(pool, config);
    if (nctIds.length === 0) throw new Error('AACT has no in-scope trials for this therapeutic area');
    const previous = await db.snapshot.findFirst({ orderBy: { createdAt: 'desc' } });
    const snapshot = await db.snapshot.create({
      data: {
        aactVersion: identity.version,
        source: identity.source,
        area: config.THERAPEUTIC_AREA,
        fetchedAt: identity.fetchedAt,
        checksum: identity.checksum,
        previousId: previous?.id ?? null,
      },
    });
    const run = await db.pipelineRun.create({ data: { snapshotId: snapshot.id, step: 'snapshot', stats: {} } });
    log.info('snapshot created', { id: snapshot.id, version: identity.version, trials: nctIds.length });

    const currentHashes = new Map<string, string>();
    let outcomes = 0;
    let analyses = 0;

    for (const batch of chunk(nctIds, Math.min(config.INGEST_BATCH_SIZE, 100))) {
      const studies = await pool.query('SELECT * FROM ctgov.studies WHERE nct_id = ANY($1)', [batch]);
      const children = new Map<string, Map<string, Row[]>>();
      for (const table of STUDY_TABLES) children.set(table, await rowsFor(pool, table, batch));
      const outcomeRows = await rowsFor(pool, 'outcomes', batch);
      const measurements = await rowsFor(pool, 'outcome_measurements', batch);
      const counts = await rowsFor(pool, 'outcome_counts', batch);
      const analysisRows = await rowsFor(pool, 'outcome_analyses', batch);
      const analysisGroups = await rowsFor(pool, 'outcome_analysis_groups', batch);

      const rawStudies: Prisma.RawStudyCreateManyInput[] = [];
      const rawOutcomes: Prisma.RawOutcomeMeasureCreateManyInput[] = [];
      const rawAnalyses: Prisma.RawOutcomeAnalysisCreateManyInput[] = [];

      for (const study of studies.rows as Row[]) {
        const nct = study.nct_id as string;
        const studyPayload: Record<string, unknown> = { study };
        for (const table of STUDY_TABLES) studyPayload[table] = children.get(table)?.get(nct) ?? [];

        const outcomePayloads = (outcomeRows.get(nct) ?? []).map((outcome) => ({
          outcome,
          measurements: (measurements.get(nct) ?? []).filter((m) => m.outcome_id === outcome.id),
          counts: (counts.get(nct) ?? []).filter((c) => c.outcome_id === outcome.id),
        }));
        const analysisPayloads = (analysisRows.get(nct) ?? []).map((analysis) => ({
          analysis,
          groups: (analysisGroups.get(nct) ?? []).filter((g) => g.outcome_analysis_id === analysis.id),
        }));

        const contentHash = hashOf({ studyPayload, outcomePayloads, analysisPayloads });
        currentHashes.set(nct, contentHash);
        rawStudies.push({
          snapshotId: snapshot.id,
          nctId: nct,
          payload: studyPayload as Prisma.InputJsonValue,
          contentHash,
        });
        for (const payload of outcomePayloads) {
          rawOutcomes.push({
            snapshotId: snapshot.id,
            nctId: nct,
            aactOutcomeId: String(payload.outcome.id),
            payload: payload as Prisma.InputJsonValue,
          });
        }
        for (const payload of analysisPayloads) {
          rawAnalyses.push({
            snapshotId: snapshot.id,
            nctId: nct,
            aactOutcomeId: String(payload.analysis.outcome_id),
            aactAnalysisId: String(payload.analysis.id),
            payload: payload as Prisma.InputJsonValue,
          });
        }
      }

      await db.rawStudy.createMany({ data: rawStudies });
      for (const part of chunk(rawOutcomes, 500)) await db.rawOutcomeMeasure.createMany({ data: part });
      for (const part of chunk(rawAnalyses, 1000)) await db.rawOutcomeAnalysis.createMany({ data: part });
      outcomes += rawOutcomes.length;
      analyses += rawAnalyses.length;
      log.info('raw batch written', { trials: currentHashes.size, outcomes, analyses });
    }

    // delta sync against the previous snapshot
    const deltas: Prisma.SnapshotDeltaCreateManyInput[] = [];
    if (previous) {
      const before = await db.rawStudy.findMany({
        where: { snapshotId: previous.id },
        select: { nctId: true, contentHash: true },
      });
      const previousHashes = new Map(before.map((r) => [r.nctId, r.contentHash]));
      for (const [nct, hash] of currentHashes) {
        const old = previousHashes.get(nct);
        if (old === undefined) deltas.push({ snapshotId: snapshot.id, nctId: nct, kind: 'ADDED', currentHash: hash });
        else if (old !== hash) {
          deltas.push({ snapshotId: snapshot.id, nctId: nct, kind: 'CHANGED', previousHash: old, currentHash: hash });
        }
      }
      for (const [nct, old] of previousHashes) {
        if (!currentHashes.has(nct)) deltas.push({ snapshotId: snapshot.id, nctId: nct, kind: 'REMOVED', previousHash: old });
      }
      for (const part of chunk(deltas, 1000)) await db.snapshotDelta.createMany({ data: part });
    }

    const stats = {
      trials: currentHashes.size,
      outcomes,
      analyses,
      delta: {
        added: deltas.filter((d) => d.kind === 'ADDED').length,
        changed: deltas.filter((d) => d.kind === 'CHANGED').length,
        removed: deltas.filter((d) => d.kind === 'REMOVED').length,
      },
    };
    await db.snapshot.update({ where: { id: snapshot.id }, data: { studyCount: currentHashes.size } });
    await db.pipelineRun.update({ where: { id: run.id }, data: { stats, finishedAt: new Date() } });
    log.info('snapshot complete', stats);
    return snapshot.id;
  } finally {
    await pool.end();
  }
}
