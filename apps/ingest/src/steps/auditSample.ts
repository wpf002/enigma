// Draws the 200 harmonization decisions for the Phase 2 clinician audit and
// writes them as a CSV with empty reviewer columns.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDb } from '@enigma/db';
import { RULE_SET_VERSION } from '@enigma/harmonize';
import type { Factor } from '@enigma/provenance';
import { createLogger } from '@enigma/shared';

const log = createLogger('audit-sample');

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;

export async function runAuditSample(snapshotId: string): Promise<string> {
  const db = getDb();
  // md5(id) gives a fixed pseudo-random order, so the sample is the same on every run.
  const pick = (where: string, n: number) =>
    db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "EffectRecord" WHERE "snapshotId" = $1 AND ${where} ORDER BY md5(id) LIMIT ${n}`,
      snapshotId,
    );
  const ids = [
    ...(await pick(`"endpointNodeId" IS NOT NULL`, 80)),
    ...(await pick(`"endpointNodeId" IS NULL`, 40)),
    ...(await pick(`"sourceKind" = 'ANALYSIS' AND "directionResolved"`, 40)),
    ...(await pick(`cardinality(agents) > 0 AND "doseDaily" IS NOT NULL`, 40)),
  ].map((r) => r.id);
  const records = await db.effectRecord.findMany({ where: { id: { in: ids } }, include: { trial: true } });
  const byId = new Map(records.map((r) => [r.id, r]));

  const kinds = [
    ...Array(80).fill('ENDPOINT_MAPPED'), ...Array(40).fill('ENDPOINT_UNASSIGNED'),
    ...Array(40).fill('ARM_ROLES_AND_DIRECTION'), ...Array(40).fill('INTERVENTION_AND_DOSE'),
  ];
  const lines = [
    ['decision_kind', 'nct_id', 'outcome_title', 'classification', 'units', 'experimental_arm', 'comparator_arm',
      'endpoint_node', 'agents', 'dose_daily', 'comparator_class', 'analysis_population', 'timepoint_days',
      'population_background', 'rules_fired', 'reviewer_agrees', 'reviewer_note'].join(','),
  ];
  ids.forEach((id, i) => {
    const r = byId.get(id);
    if (!r) return;
    const rules = (r.factors as unknown as Factor[]).filter((f) => f.stage !== 'GATE').map((f) => f.rule).join(' > ');
    const population = r.trial.population as { background?: string };
    lines.push([
      kinds[i], r.nctId, r.outcomeTitle, r.classification, r.units, r.experimentalLabel, r.comparatorLabel,
      r.endpointNodeId, r.agents.join('+'), r.doseDaily ? `${r.doseDaily} ${r.doseUnit}/day` : '', r.comparatorClass,
      r.analysisPopulation, r.timepointDays, population.background, rules, '', '',
    ].map(csv).join(','));
  });

  const dir = fileURLToPath(new URL('../../../../fixtures/generated/', import.meta.url));
  await mkdir(dir, { recursive: true });
  const path = `${dir}harmonization_audit_${RULE_SET_VERSION}.csv`;
  await writeFile(path, `${lines.join('\n')}\n`);
  log.info('audit sample written', { path, decisions: lines.length - 1 });
  return path;
}
