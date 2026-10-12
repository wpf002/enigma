// Builds an AACT-shaped `ctgov` schema from the public ClinicalTrials.gov API v2.
//
// AACT is itself derived from ClinicalTrials.gov, so the rows carry the same
// registry data. This exists because the full AACT dump needs a CTTI account.
// The resulting snapshot is labelled CTGOV_API_SUBSET, never AACT_DUMP.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createLogger, getArea, stableStringify, type EnigmaConfig } from '@enigma/shared';
import { aactPool } from './client.js';
import { mapStudy, type AactRows, type IdAllocator } from './mapStudy.js';

const API = 'https://clinicaltrials.gov/api/v2';
const log = createLogger('aact:subset');

const TABLE_ORDER = [
  'studies', 'designs', 'eligibilities', 'conditions', 'browse_conditions', 'interventions',
  'intervention_other_names', 'browse_interventions', 'design_groups', 'design_group_interventions',
  'sponsors', 'result_groups', 'baseline_counts', 'baseline_measurements', 'outcomes',
  'outcome_counts', 'outcome_measurements', 'outcome_analyses', 'outcome_analysis_groups',
] as const;

async function getJson(url: string, attempt = 1): Promise<any> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 5) throw new Error(`GET ${url} failed after ${attempt} attempts: ${String(err)}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
}

function inScope(doc: any): boolean {
  const p = doc.protocolSection ?? {};
  return (
    p.designModule?.studyType === 'INTERVENTIONAL' &&
    ['COMPLETED', 'TERMINATED'].includes(p.statusModule?.overallStatus) &&
    doc.hasResults === true
  );
}

async function insertRows(client: pg.PoolClient, rows: AactRows): Promise<void> {
  for (const table of TABLE_ORDER) {
    const batch = rows[table];
    if (!batch?.length) continue;
    await client.query(
      `INSERT INTO ctgov.${table} SELECT * FROM json_populate_recordset(null::ctgov.${table}, $1::json)`,
      [JSON.stringify(batch)],
    );
  }
}

export interface SubsetOptions {
  /** Cap on studies fetched from the condition query. Used by tests and smoke runs. */
  limit?: number;
}

export async function buildSubset(config: EnigmaConfig, options: SubsetOptions = {}): Promise<void> {
  const area = getArea(config.THERAPEUTIC_AREA);
  const pool = aactPool(config);
  const ddl = await readFile(
    fileURLToPath(new URL('../../../../infra/aact/ctgov_subset_schema.sql', import.meta.url)),
    'utf8',
  );

  const version = await getJson(`${API}/version`);
  const dataTimestamp = String(version.dataTimestamp);
  log.info('registry version', { dataTimestamp, area: area.id });

  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS ctgov CASCADE');
    await client.query(ddl);

    const counters = new Map<string, number>();
    const ids: IdAllocator = {
      next(table) {
        const n = (counters.get(table) ?? 0) + 1;
        counters.set(table, n);
        return n;
      },
    };
    const seen = new Set<string>();
    const hashes: string[] = [];

    const load = async (docs: any[]) => {
      const merged: AactRows = {};
      for (const doc of docs) {
        const nct = doc.protocolSection?.identificationModule?.nctId as string | undefined;
        if (!nct || seen.has(nct) || !inScope(doc)) continue;
        seen.add(nct);
        hashes.push(`${nct}:${createHash('sha256').update(stableStringify(doc)).digest('hex')}`);
        for (const [table, rows] of Object.entries(mapStudy(doc, ids))) {
          (merged[table] ??= []).push(...rows);
        }
      }
      await client.query('BEGIN');
      await insertRows(client, merged);
      await client.query('COMMIT');
    };

    const params = new URLSearchParams({
      'query.cond': area.conditionQuery,
      'filter.overallStatus': 'COMPLETED,TERMINATED',
      aggFilters: 'results:with,studyType:int',
      pageSize: '50',
    });
    let token: string | undefined;
    do {
      if (token) params.set('pageToken', token);
      const page = await getJson(`${API}/studies?${params.toString()}`);
      await load(page.studies ?? []);
      token = page.nextPageToken;
      log.info('loaded', { studies: seen.size });
      if (options.limit && seen.size >= options.limit) break;
    } while (token);

    for (const nct of area.extraNctIds) {
      if (seen.has(nct)) continue;
      await load([await getJson(`${API}/studies/${nct}`)]);
    }

    hashes.sort();
    const checksum = createHash('sha256').update(hashes.join('\n')).digest('hex');
    const meta: Record<string, string> = {
      source: 'CTGOV_API_SUBSET',
      version: `ctgov-api-${dataTimestamp.slice(0, 10)}-${area.id}`,
      data_timestamp: dataTimestamp,
      fetched_at: new Date().toISOString(),
      checksum,
      area: area.id,
      study_count: String(seen.size),
    };
    for (const [key, value] of Object.entries(meta)) {
      await client.query(
        'INSERT INTO ctgov.enigma_subset_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value],
      );
    }
    log.info('subset complete', meta);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
