// Phase 2: map every EffectRecord and Trial onto the comparability schema.
// Endpoint node, canonical unit, follow-up length, analysis population,
// population profile and the intervention / comparator keys.
import { timeFrameDays, type EffectMeasure } from '@enigma/core';
import { getDb } from '@enigma/db';
import {
  classifyAnalysisPopulation, classifyEndpoint, encodePopulation, ENDPOINT_BY_ID, endpointDepth, ENDPOINTS, populationKey,
  POPULATION_RULES, profileArm, resolveUnit, RULE_SET_VERSION, UNIT_RULE, UNIT_UNKNOWN_RULE, type DesignGroup,
} from '@enigma/harmonize';
import { FactorChain, type Factor } from '@enigma/provenance';
import { chunk, createLogger, hashOf, type EnigmaConfig } from '@enigma/shared';
import { clearDerived, recordRun } from '../context.js';

const log = createLogger('harmonize');
type Row = Record<string, any>;

const TIMEPOINT_RULE = 'timepoint.parse_time_frame';
const HASH_RULE = 'comparison.keys';

async function materializeOntology(): Promise<void> {
  const db = getDb();
  await db.endpointNode.deleteMany({});
  await db.endpointNode.createMany({
    data: ENDPOINTS.map((e) => ({
      id: e.id,
      parentId: e.parent,
      label: e.label,
      family: e.family,
      depth: endpointDepth(e.id),
      lowerIsBetter: e.lowerIsBetter,
      meshTerms: e.mesh,
      ruleVersion: RULE_SET_VERSION,
    })),
  });
}

const inc = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);

export async function runHarmonize(_config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  await clearDerived(snapshotId, 'gate');
  await materializeOntology();

  const trials = await db.trial.findMany({ where: { snapshotId }, select: { id: true, nctId: true }, orderBy: { nctId: 'asc' } });
  if (trials.length === 0) throw new Error('no trials for this snapshot: run `pnpm ingest normalize` first');

  const stats = {
    trials: trials.length,
    records: 0,
    endpointMapped: 0,
    endpointByNode: {} as Record<string, number>,
    endpointUnassigned: {} as Record<string, number>,
    unitsRecognized: 0,
    unitsUnrecognized: 0,
    timepointKnown: 0,
    analysisPopulation: {} as Record<string, number>,
    background: {} as Record<string, number>,
    hba1cRangeEncoded: 0,
    cvRiskPopulations: 0,
  };

  for (const batch of chunk(trials, 100)) {
    const nctIds = batch.map((t) => t.nctId);
    const [rawStudies, rawOutcomes, records] = await Promise.all([
      db.rawStudy.findMany({ where: { snapshotId, nctId: { in: nctIds } } }),
      db.rawOutcomeMeasure.findMany({ where: { snapshotId, nctId: { in: nctIds } }, select: { aactOutcomeId: true, payload: true } }),
      db.effectRecord.findMany({ where: { snapshotId, nctId: { in: nctIds } } }),
    ]);

    // ---- trials: population profile and harmonized arms
    const populationHashes = new Map<string, string>();
    const trialUpdates: Row[] = [];
    for (const raw of rawStudies) {
      const payload = raw.payload as Row;
      const profile = encodePopulation((payload.eligibilities as Row[])[0], payload.baseline_measurements as Row[]);
      const hash = hashOf(populationKey(profile)).slice(0, 16);
      populationHashes.set(raw.nctId, hash);
      inc(stats.background, profile.background);
      if (profile.hba1cMin !== null || profile.hba1cMax !== null) stats.hba1cRangeEncoded += 1;
      if (profile.cvRisk === 'ESTABLISHED_OR_HIGH') stats.cvRiskPopulations += 1;
      const designGroups: DesignGroup[] = (payload.design_groups as Row[]).map((g) => ({
        title: g.title ?? '', groupType: g.group_type ?? null, description: g.description ?? null,
      }));
      const arms = designGroups.map((g, i) => {
        const arm = profileArm({ code: `AG${i}`, title: g.title, description: g.description }, designGroups);
        return {
          title: g.title,
          type: g.groupType,
          agents: arm.agents.map((a) => a.id),
          placebo: arm.placebo,
          doses: Object.fromEntries(Object.entries(arm.doses).map(([k, d]) => [k, { daily: d.daily, unit: d.unit, source: d.source }])),
        };
      });
      trialUpdates.push({ nctId: raw.nctId, population: profile, populationHash: hash, arms });
    }
    await db.$executeRaw`
      UPDATE "Trial" t
         SET population = x.population, "populationHash" = x."populationHash", arms = x.arms, "ruleVersion" = ${RULE_SET_VERSION}
        FROM jsonb_to_recordset(${JSON.stringify(trialUpdates)}::jsonb)
             AS x("nctId" text, population jsonb, "populationHash" text, arms jsonb)
       WHERE t."snapshotId" = ${snapshotId} AND t."nctId" = x."nctId"`;

    // ---- effect records
    const outcomePopulation = new Map(rawOutcomes.map((o) => [o.aactOutcomeId, (o.payload as Row).outcome?.population as string | null]));
    const updates: Row[] = [];
    for (const rec of records) {
      stats.records += 1;
      const measure = rec.measure as EffectMeasure;
      const decision = classifyEndpoint({ title: rec.outcomeTitle, classification: rec.classification, measure, units: rec.units });
      const node = decision.nodeId ? ENDPOINT_BY_ID.get(decision.nodeId) : undefined;
      const chain = FactorChain.from((rec.factors as unknown as Factor[]).filter((f) => f.stage !== 'HARMONIZE'));

      chain.add({
        stage: 'HARMONIZE',
        name: 'harmonize.endpoint',
        rule: decision.rule,
        ruleVersion: RULE_SET_VERSION,
        inputs: { title: rec.outcomeTitle, classification: rec.classification, measure, units: rec.units },
        output: decision.nodeId,
        outcome: decision.nodeId ? 'PASS' : 'FAIL',
        note: node ? `Mapped to "${node.label}".` : `Not assigned: ${decision.reason}.`,
      });
      if (node) {
        stats.endpointMapped += 1;
        inc(stats.endpointByNode, node.id);
      } else inc(stats.endpointUnassigned, decision.reason ?? 'UNMAPPED');

      // unit algebra: a mean difference scales linearly with the unit
      let { value, ciLow, ciHigh, se, pooledSd } = {
        value: rec.value.toNumber(),
        ciLow: rec.ciLow?.toNumber() ?? null,
        ciHigh: rec.ciHigh?.toNumber() ?? null,
        se: rec.se?.toNumber() ?? null,
        pooledSd: rec.pooledSd?.toNumber() ?? null,
      };
      let units = rec.units;
      if (measure === 'MD' && node) {
        const unit = resolveUnit(node.analyte, rec.units);
        if (unit.recognized) stats.unitsRecognized += 1;
        else stats.unitsUnrecognized += 1;
        chain.add({
          stage: 'HARMONIZE',
          name: 'harmonize.unit',
          rule: unit.recognized ? UNIT_RULE : UNIT_UNKNOWN_RULE,
          ruleVersion: RULE_SET_VERSION,
          inputs: { postedUnit: rec.units, analyte: node.analyte ?? null, value },
          output: { unit: unit.unit, factor: unit.factor },
          note: unit.recognized ? `Rescaled to ${unit.unit}.` : 'Unit not recognized. Kept as posted.',
        });
        value *= unit.factor;
        ciLow = ciLow === null ? null : ciLow * unit.factor;
        ciHigh = ciHigh === null ? null : ciHigh * unit.factor;
        se = se === null ? null : se * unit.factor;
        pooledSd = pooledSd === null ? null : pooledSd * unit.factor;
        units = unit.unit;
      }

      const timepointDays = decision.classificationDays ?? timeFrameDays(rec.timeFrame);
      if (timepointDays !== null) stats.timepointKnown += 1;
      chain.add({
        stage: 'HARMONIZE',
        name: 'harmonize.timepoint',
        rule: TIMEPOINT_RULE,
        ruleVersion: RULE_SET_VERSION,
        inputs: { timeFrame: rec.timeFrame, classification: decision.classificationRole === 'VISIT' ? rec.classification : null },
        output: timepointDays,
        note: timepointDays === null ? 'No follow-up length could be read.' : `Follow-up of ${timepointDays} days.`,
      });

      const analysis = classifyAnalysisPopulation(outcomePopulation.get(rec.outcomeMeasureId));
      inc(stats.analysisPopulation, analysis.population);
      chain.add({
        stage: 'HARMONIZE',
        name: 'harmonize.analysis_population',
        rule: analysis.rule,
        ruleVersion: RULE_SET_VERSION,
        inputs: { population: (outcomePopulation.get(rec.outcomeMeasureId) ?? null)?.slice(0, 240) ?? null },
        output: analysis.population,
        note: `Analysis population ${analysis.population}.`,
      });

      const populationHash = populationHashes.get(rec.nctId) ?? null;
      const interventionHash = rec.agents.length ? rec.agents.join('+') : null;
      const comparatorHash = rec.comparatorClass ? `${rec.comparatorClass}:${rec.comparatorAgents.join('+')}` : null;
      chain.add({
        stage: 'HARMONIZE',
        name: 'harmonize.keys',
        rule: HASH_RULE,
        ruleVersion: RULE_SET_VERSION,
        inputs: { agents: rec.agents, comparatorClass: rec.comparatorClass, comparatorAgents: rec.comparatorAgents },
        output: { populationHash, interventionHash, comparatorHash, populationRule: POPULATION_RULES.background },
        note: 'Keys the gate blocks and compares on.',
      });

      updates.push({
        id: rec.id,
        endpointNodeId: decision.nodeId,
        lowerIsBetter: node?.lowerIsBetter ?? null,
        value, ciLow, ciHigh, se, pooledSd, units,
        timepointDays,
        analysisPopulation: analysis.population,
        populationHash, interventionHash, comparatorHash,
        factors: chain.toJSON(),
      });
    }

    for (const part of chunk(updates, 1000)) {
      await db.$executeRaw`
        UPDATE "EffectRecord" e
           SET "endpointNodeId" = x."endpointNodeId", "lowerIsBetter" = x."lowerIsBetter",
               value = x.value, "ciLow" = x."ciLow", "ciHigh" = x."ciHigh", se = x.se, "pooledSd" = x."pooledSd", units = x.units,
               "timepointDays" = x."timepointDays", "analysisPopulation" = x."analysisPopulation",
               "populationHash" = x."populationHash", "interventionHash" = x."interventionHash", "comparatorHash" = x."comparatorHash",
               factors = x.factors
          FROM jsonb_to_recordset(${JSON.stringify(part)}::jsonb)
               AS x(id text, "endpointNodeId" text, "lowerIsBetter" boolean, value numeric, "ciLow" numeric, "ciHigh" numeric,
                    se numeric, "pooledSd" numeric, units text, "timepointDays" int, "analysisPopulation" text,
                    "populationHash" text, "interventionHash" text, "comparatorHash" text, factors jsonb)
         WHERE e.id = x.id`;
    }
    log.info('batch harmonized', { records: stats.records, endpointMapped: stats.endpointMapped });
  }

  const gate = {
    // Phase 2 exit gate: clinician audit of 200 decisions at >= 90% agreement. Needs a human reviewer.
    clinicianAudit: 'NOT_RUN',
    auditSample: 'pnpm ingest audit-sample',
    endpointMappedShare: stats.records ? stats.endpointMapped / stats.records : 0,
  };
  await recordRun(snapshotId, 'harmonize', RULE_SET_VERSION, { ...stats, gate }, startedAt);
  log.info('harmonize complete', { ...stats, endpointByNode: undefined, gate });
}
