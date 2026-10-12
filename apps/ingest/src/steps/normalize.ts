// Phase 1: raw outcome analyses and arm-level measurements -> EffectRecord.
// TypeScript reads the rows, classifies the measure and assigns arm roles.
// The engine computes every number.
import { conventionFor, type EffectMeasure } from '@enigma/core';
import { getDb, type Prisma } from '@enigma/db';
import {
  assignRoles, classifyArmData, classifyMeasure, classifyStopReason, directionHint, DIRECTION_HINT_RULE, profileArm,
  RULE_SET_VERSION, type ArmProfile, type DesignGroup, type RoleAssignment,
} from '@enigma/harmonize';
import { FactorChain, type Factor } from '@enigma/provenance';
import { chunk, createLogger, type EnigmaConfig } from '@enigma/shared';
import { clearDerived, recordRun } from '../context.js';
import { callEngine, engineRuleVersion } from '../engine.js';

const log = createLogger('normalize');

type Row = Record<string, any>;

interface ArmData {
  n: number | null;
  value: number | null;
  spread: number | null;
  lower: number | null;
  upper: number | null;
}

interface Pending {
  ref: string;
  /** outcome | experimental code | comparator code */
  pairKey: string;
  classification: string | null;
  nctId: string;
  outcome: Row;
  analysis: Row | null;
  roles: RoleAssignment;
  measure: EffectMeasure | null;
  nonInferiority: boolean;
  preFactors: FactorChain;
  candidate: Record<string, unknown>;
}

interface EngineEffect {
  measure: EffectMeasure;
  value: number;
  ciLow: number;
  ciHigh: number;
  ciLevel: number;
  se: number;
  pValue: number | null;
  n: number | null;
  nExperimental: number | null;
  nComparator: number | null;
  controlRisk: number | null;
  pooledSd: number | null;
  dispersionType: string;
  directionConvention: string;
  directionResolved: boolean;
}

interface EngineResult {
  ref: string;
  ok: boolean;
  reason: string | null;
  detail: string | null;
  effect: EngineEffect | null;
  factors: Factor[];
}

const date = (v: unknown): Date | null => (typeof v === 'string' && v ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function ciSides(v: unknown): number | null {
  const s = String(v ?? '').toUpperCase();
  return s.includes('TWO') || s === '2' ? 2 : s.includes('ONE') || s === '1' ? 1 : null;
}

function analysisDispersion(v: unknown): string | null {
  const s = String(v ?? '').toUpperCase();
  return s.includes('ERROR') ? 'SE' : s.includes('DEVIATION') ? 'SD' : null;
}

/** Arm-level data for one result group within one stratum (the rows of a single classification). */
function armData(rows: Row[] | null, counts: Row[], code: string): ArmData | null {
  const row = rows?.find((m) => m.ctgov_group_code === code);
  if (!row) return null;
  const forCode = counts.filter((c) => c.ctgov_group_code === code);
  const count =
    forCode.find((c) => String(c.scope ?? '').toLowerCase() === 'measure' && /participant/i.test(String(c.units ?? ''))) ?? forCode[0];
  return {
    n: numOrNull(count?.count),
    value: numOrNull(row.param_value_num),
    spread: numOrNull(row.dispersion_value_num),
    lower: numOrNull(row.dispersion_lower_limit),
    upper: numOrNull(row.dispersion_upper_limit),
  };
}

function buildTrial(snapshotId: string, nctId: string, payload: Row): Prisma.TrialCreateManyInput {
  const study = payload.study as Row;
  const lead = (payload.sponsors as Row[]).find((s) => s.lead_or_collaborator === 'lead');
  const design = (payload.designs as Row[])[0];
  const stop = classifyStopReason(String(study.overall_status ?? ''), study.why_stopped ?? null);
  return {
    snapshotId,
    nctId,
    title: study.brief_title ?? nctId,
    acronym: study.acronym ?? null,
    status: String(study.overall_status ?? '').toUpperCase(),
    phase: study.phase ?? null,
    enrollment: numOrNull(study.enrollment),
    startDate: date(study.start_date),
    completionDate: date(study.primary_completion_date ?? study.completion_date),
    resultsPostedDate: date(study.results_first_posted_date ?? study.results_first_submitted_date),
    sponsor: lead?.name ?? study.source ?? null,
    sponsorClass: lead?.agency_class ?? study.source_class ?? null,
    allocation: design?.allocation ?? null,
    masking: design?.masking ?? null,
    whyStopped: study.why_stopped ?? null,
    stopCategory: stop?.category ?? null,
    population: {},
    populationHash: '',
    arms: [],
    ruleVersion: RULE_SET_VERSION,
  };
}

export async function runNormalize(config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  const engineVersion = await engineRuleVersion(config);
  const ruleVersion = `${RULE_SET_VERSION}+${engineVersion}`;
  await clearDerived(snapshotId, 'normalize');

  const studies = await db.rawStudy.findMany({ where: { snapshotId }, select: { nctId: true }, orderBy: { nctId: 'asc' } });
  const stats = {
    trials: studies.length,
    trialsWithEffect: 0,
    trialsWithoutComparison: 0,
    parallelTrials: 0,
    parallelTrialsWithEffect: 0,
    analyses: 0,
    records: 0,
    bySource: { ANALYSIS: 0, DERIVED_ARMS: 0 } as Record<string, number>,
    byMeasure: {} as Record<string, number>,
    directionResolved: 0,
    failures: {} as Record<string, number>,
  };
  const fail = (reason: string) => (stats.failures[reason] = (stats.failures[reason] ?? 0) + 1);

  for (const batch of chunk(studies.map((s) => s.nctId), 100)) {
    const [rawStudies, rawOutcomes, rawAnalyses] = await Promise.all([
      db.rawStudy.findMany({ where: { snapshotId, nctId: { in: batch } } }),
      db.rawOutcomeMeasure.findMany({ where: { snapshotId, nctId: { in: batch } } }),
      db.rawOutcomeAnalysis.findMany({ where: { snapshotId, nctId: { in: batch } } }),
    ]);

    await db.trial.createMany({ data: rawStudies.map((s) => buildTrial(snapshotId, s.nctId, s.payload as Row)) });
    const trialIds = new Map(
      (await db.trial.findMany({ where: { snapshotId, nctId: { in: batch } }, select: { id: true, nctId: true } })).map((t) => [t.nctId, t.id]),
    );

    const pending: Pending[] = [];
    const failures: Prisma.NormalizationFailureCreateManyInput[] = [];
    const comparable = new Set<string>();
    const parallelTrials = new Set<string>();

    for (const study of rawStudies) {
      const payload = study.payload as Row;
      const nctId = study.nctId;
      const designGroups: DesignGroup[] = (payload.design_groups as Row[]).map((g) => ({
        title: g.title ?? '',
        groupType: g.group_type ?? null,
        description: g.description ?? null,
      }));
      const model = String((payload.designs as Row[])[0]?.intervention_model ?? '').toUpperCase();
      const parallel = !/CROSSOVER|SINGLE/.test(model);
      if (parallel) parallelTrials.add(nctId);
      const groupById = new Map<number, Row>((payload.result_groups as Row[]).map((g) => [Number(g.id), g]));
      const profiles = new Map<number, ArmProfile>();
      const profile = (groupId: number, code: string): ArmProfile => {
        let p = profiles.get(groupId);
        if (!p) {
          const g = groupById.get(groupId);
          p = profileArm({ code, title: g?.title ?? code, description: g?.description ?? null }, designGroups);
          profiles.set(groupId, p);
        }
        return p;
      };

      for (const rawOutcome of rawOutcomes.filter((o) => o.nctId === nctId)) {
        const { outcome, measurements, counts } = rawOutcome.payload as { outcome: Row; measurements: Row[]; counts: Row[] };
        const codes = new Map<string, number>();
        for (const m of measurements) if (!codes.has(m.ctgov_group_code)) codes.set(m.ctgov_group_code, Number(m.result_group_id));
        if (codes.size >= 2) comparable.add(nctId);
        const kind = classifyArmData(outcome.param_type ?? null, outcome.dispersion_type ?? null, outcome.units ?? null);
        const outcomeId = String(outcome.id);

        // Strata: one per classification, kept only when each group posts a single row in it.
        const byClass = new Map<string, Row[]>();
        for (const m of measurements) {
          const key = String(m.classification ?? '');
          const bucket = byClass.get(key);
          if (bucket) bucket.push(m);
          else byClass.set(key, [m]);
        }
        const strata = [...byClass.entries()].filter(
          ([, rows]) => new Set(rows.map((r) => r.ctgov_group_code)).size === rows.length && rows.length >= 2,
        );
        const single = strata.length === 1 && byClass.size === 1 ? strata[0]![1] : null;

        const arms = (roles: RoleAssignment, rows: Row[] | null) => ({
          experimental: armData(rows, counts, roles.experimental.code),
          comparator: armData(rows, counts, roles.comparator.code),
          armParam: kind.armParam,
          armDispersion: kind.armDispersion,
          armCiLevel: kind.armCiLevel,
        });
        const rolesFactor = (roles: RoleAssignment) =>
          new FactorChain().add({
            stage: 'NORMALIZE',
            name: 'normalize.arm_roles',
            rule: roles.rule,
            ruleVersion: RULE_SET_VERSION,
            inputs: {
              experimental: roles.experimental.title,
              comparator: roles.comparator.title,
              experimentalType: roles.experimental.designType,
              comparatorType: roles.comparator.designType,
            },
            output: { agents: roles.agents, comparatorClass: roles.comparatorClass, background: roles.background },
            note: 'Experimental and comparator arms assigned.',
          });

        // posted analyses
        for (const rawAnalysis of rawAnalyses.filter((a) => a.aactOutcomeId === outcomeId && a.nctId === nctId)) {
          stats.analyses += 1;
          const { analysis, groups } = rawAnalysis.payload as { analysis: Row; groups: Row[] };
          const analysisId = String(analysis.id);
          const reject = (reason: string, detail?: string) => {
            fail(reason);
            failures.push({ snapshotId, nctId, outcomeMeasureId: outcomeId, analysisId, reason, detail: detail ?? null });
          };
          const distinct = [...new Map(groups.map((g) => [g.ctgov_group_code as string, g])).values()];
          if (distinct.length !== 2) {
            reject('ANALYSIS_NOT_PAIRWISE', `${distinct.length} groups`);
            continue;
          }
          const [g1, g2] = distinct as [Row, Row];
          const roles = assignRoles(
            profile(Number(g1.result_group_id ?? codes.get(g1.ctgov_group_code)), g1.ctgov_group_code),
            profile(Number(g2.result_group_id ?? codes.get(g2.ctgov_group_code)), g2.ctgov_group_code),
          );
          if ('reason' in roles) {
            reject(roles.reason, roles.detail);
            continue;
          }
          const hrLike = /hazard|cox/i.test(String(analysis.param_type ?? ''));
          const outcomeKind = hrLike ? 'TIME_TO_EVENT' : kind.outcomeKind;
          const decision = classifyMeasure(analysis.param_type, hrLike ? 'TIME_TO_EVENT' : kind.outcomeKind);
          if ('reason' in decision) {
            reject(decision.reason, String(analysis.param_type ?? ''));
            continue;
          }
          const hint = directionHint([analysis.estimate_description, analysis.groups_description], roles.experimental, roles.comparator);
          const value = numOrNull(analysis.param_value);
          const lo = numOrNull(analysis.ci_lower_limit);
          const hi = numOrNull(analysis.ci_upper_limit);
          const percentPoints =
            decision.measure === 'RD' &&
            (/percent|%/i.test(String(outcome.units ?? '')) || [value, lo, hi].some((v) => v !== null && Math.abs(v) > 1));

          const pre = rolesFactor(roles).add({
            stage: 'NORMALIZE',
            name: 'normalize.measure',
            rule: decision.rule,
            ruleVersion: RULE_SET_VERSION,
            inputs: { paramType: analysis.param_type ?? null, outcomeKind },
            output: decision.measure,
            note: `Estimate type mapped to ${decision.measure}.`,
          });
          if (hint) {
            pre.add({
              stage: 'NORMALIZE',
              name: 'normalize.stated_order',
              rule: DIRECTION_HINT_RULE,
              ruleVersion: RULE_SET_VERSION,
              inputs: { estimateDescription: analysis.estimate_description ?? null, groupsDescription: (analysis.groups_description ?? null)?.slice(0, 200) ?? null },
              output: hint,
              note: 'The analysis states the order of the comparison.',
            });
          }
          const nonInferiority = /^(NON_INFERIORITY|EQUIVALENCE)/.test(String(analysis.non_inferiority_type ?? '').toUpperCase());
          pending.push({
            ref: `${outcomeId}|${analysisId}|${roles.experimental.code}|${roles.comparator.code}`,
            pairKey: `${outcomeId}|${roles.experimental.code}|${roles.comparator.code}`,
            classification: null,
            nctId,
            outcome,
            analysis,
            roles,
            measure: decision.measure,
            nonInferiority,
            preFactors: pre,
            candidate: {
              sourceKind: 'ANALYSIS',
              measure: decision.measure,
              logScale: decision.logScale,
              percentPoints,
              nonInferiority,
              value,
              ciLow: lo,
              ciHigh: hi,
              ciLevel: numOrNull(analysis.ci_percent) !== null ? analysis.ci_percent / 100 : null,
              ciSides: ciSides(analysis.ci_n_sides),
              pValue: numOrNull(analysis.p_value),
              pValueModifier: analysis.p_value_modifier ?? null,
              dispersionType: analysisDispersion(analysis.dispersion_type),
              dispersionValue: numOrNull(analysis.dispersion_value),
              directionHint: hint,
              outcomeKind,
              ...arms(roles, single),
            },
          });
        }

        // Arm-level fallback for every pair of groups, per stratum. Crossover and single-group
        // designs are excluded: their arms are not independent samples.
        if (parallel && kind.armParam) {
          for (const [classification, rows] of strata) {
            const list = rows.map((r) => [r.ctgov_group_code as string, Number(r.result_group_id)] as const);
            for (let i = 0; i < list.length; i += 1) {
              for (let j = i + 1; j < list.length; j += 1) {
                const roles = assignRoles(profile(list[i]![1], list[i]![0]), profile(list[j]![1], list[j]![0]));
                if ('reason' in roles) continue;
                pending.push({
                  ref: `${outcomeId}|arms:${classification}|${roles.experimental.code}|${roles.comparator.code}`,
                  pairKey: `${outcomeId}|${roles.experimental.code}|${roles.comparator.code}`,
                  classification: classification || null,
                  nctId,
                  outcome,
                  analysis: null,
                  roles,
                  measure: null,
                  nonInferiority: false,
                  preFactors: rolesFactor(roles),
                  candidate: { sourceKind: 'DERIVED_ARMS', outcomeKind: kind.outcomeKind, ...arms(roles, rows) },
                });
              }
            }
          }
        }
      }
    }

    const results = new Map<string, EngineResult>();
    for (const part of chunk(pending, 2000)) {
      const res = await callEngine<{ results: EngineResult[] }>(config, '/v1/effects/normalize', {
        candidates: part.map((p) => ({ ref: p.ref, ...p.candidate })),
      });
      for (const r of res.results) results.set(r.ref, r);
    }

    // one record per (outcome, experimental arm, comparator arm): a posted analysis beats the arm-level fallback
    const analysed = new Set(pending.filter((p) => p.analysis && results.get(p.ref)?.ok).map((p) => p.pairKey));
    const byComparison = new Map<string, Pending[]>();
    for (const p of pending) {
      if (!p.analysis && analysed.has(p.pairKey)) continue;
      const key = p.analysis ? p.pairKey : `${p.pairKey}|${p.classification ?? ''}`;
      const bucket = byComparison.get(key);
      if (bucket) bucket.push(p);
      else byComparison.set(key, [p]);
    }
    const rank = (p: Pending): number => {
      const r = results.get(p.ref);
      if (!r?.ok || !r.effect) return 100;
      if (!p.analysis) return 50;
      return (p.nonInferiority ? 4 : 0) + (r.effect.directionResolved ? 0 : 2) + (r.effect.dispersionType === 'CI' ? 0 : 1);
    };

    const records: Prisma.EffectRecordCreateManyInput[] = [];
    const yielded = new Set<string>();
    for (const group of byComparison.values()) {
      group.sort((a, b) => rank(a) - rank(b) || Number(a.analysis?.id ?? 0) - Number(b.analysis?.id ?? 0));
      const best = group[0]!;
      const result = results.get(best.ref);
      for (const p of group) {
        const r = results.get(p.ref);
        if (p.analysis && r && !r.ok) {
          fail(r.reason ?? 'ENGINE_REJECTED');
          failures.push({
            snapshotId, nctId: p.nctId, outcomeMeasureId: String(p.outcome.id), analysisId: String(p.analysis.id),
            reason: r.reason ?? 'ENGINE_REJECTED', detail: r.detail,
          });
        }
      }
      if (!result?.ok || !result.effect) continue;
      const e = result.effect;
      const { roles, outcome } = best;
      yielded.add(best.nctId);
      stats.records += 1;
      stats.bySource[best.analysis ? 'ANALYSIS' : 'DERIVED_ARMS'] = (stats.bySource[best.analysis ? 'ANALYSIS' : 'DERIVED_ARMS'] ?? 0) + 1;
      stats.byMeasure[e.measure] = (stats.byMeasure[e.measure] ?? 0) + 1;
      if (e.directionResolved) stats.directionResolved += 1;
      records.push({
        snapshotId,
        trialId: trialIds.get(best.nctId)!,
        nctId: best.nctId,
        outcomeMeasureId: String(outcome.id),
        analysisId: best.analysis ? String(best.analysis.id) : null,
        sourceKind: best.analysis ? 'ANALYSIS' : 'DERIVED_ARMS',
        outcomeTitle: outcome.title ?? '',
        classification: best.classification,
        outcomeType: outcome.outcome_type ?? null,
        timeFrame: outcome.time_frame ?? null,
        units: outcome.units ?? null,
        measure: e.measure,
        value: e.value,
        ciLow: e.ciLow,
        ciHigh: e.ciHigh,
        ciLevel: e.ciLevel,
        se: e.se,
        pValue: e.pValue,
        dispersionType: e.dispersionType,
        nAnalyzed: e.n,
        nExperimental: e.nExperimental,
        nComparator: e.nComparator,
        controlRisk: e.controlRisk,
        pooledSd: e.pooledSd,
        directionConvention: conventionFor(e.measure),
        directionResolved: e.directionResolved,
        experimentalLabel: roles.experimental.title,
        comparatorLabel: roles.comparator.title,
        agents: roles.agents,
        agentClass: roles.agentClass,
        doseDaily: roles.dose?.daily ?? null,
        doseUnit: roles.dose?.unit ?? null,
        comparatorClass: roles.comparatorClass,
        comparatorAgents: roles.comparatorAgents,
        factors: best.preFactors.extend(result.factors).toJSON() as unknown as Prisma.InputJsonValue,
        ruleVersion,
      });
    }

    for (const part of chunk(records, 500)) await db.effectRecord.createMany({ data: part });
    for (const part of chunk(failures, 1000)) await db.normalizationFailure.createMany({ data: part });
    stats.trialsWithEffect += yielded.size;
    stats.trialsWithoutComparison += batch.filter((nct) => !comparable.has(nct)).length;
    stats.parallelTrials += [...parallelTrials].filter((nct) => comparable.has(nct)).length;
    stats.parallelTrialsWithEffect += [...parallelTrials].filter((nct) => comparable.has(nct) && yielded.has(nct)).length;
    log.info('batch normalized', { records: stats.records, trialsWithEffect: stats.trialsWithEffect });
  }

  const gate = {
    // Phase 1 exit gate: >=95% of results-posted trials yield at least one valid EffectRecord.
    yieldAllTrials: stats.trials ? stats.trialsWithEffect / stats.trials : 0,
    // Single-group trials post no between-arm comparison. Crossover arms are not independent
    // samples, so only their posted analyses are used. This is the yield without those two.
    yieldParallelTrials: stats.parallelTrials ? stats.parallelTrialsWithEffect / stats.parallelTrials : 0,
    target: 0.95,
  };
  await recordRun(snapshotId, 'normalize', ruleVersion, { ...stats, gate }, startedAt);
  log.info('normalize complete', { ...stats, gate });
}
