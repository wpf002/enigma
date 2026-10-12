// Population encoder: eligibility criteria and baseline characteristics -> a
// small structured profile the gate can score overlap on.
import { defineRule } from './registry.js';

export type BackgroundTherapy = 'NAIVE' | 'METFORMIN' | 'SU' | 'DUAL_ORAL' | 'INSULIN' | 'UNSPECIFIED';

/** Treatment line. Used by the gate to score how far apart two populations are. */
export const THERAPY_LINE: Record<BackgroundTherapy, number | null> = {
  NAIVE: 0, METFORMIN: 1, SU: 1, DUAL_ORAL: 2, INSULIN: 3, UNSPECIFIED: null,
};

export interface PopulationProfile {
  ageMin: number | null;
  ageMax: number | null;
  sex: 'ALL' | 'FEMALE' | 'MALE';
  hba1cMin: number | null;
  hba1cMax: number | null;
  bmiMin: number | null;
  bmiMax: number | null;
  background: BackgroundTherapy;
  cvRisk: 'ESTABLISHED_OR_HIGH' | 'GENERAL';
  renal: 'CKD' | 'GENERAL';
  heartFailure: boolean;
  baseline: {
    ageMean: number | null;
    femalePct: number | null;
    hba1cMean: number | null;
    bmiMean: number | null;
  };
}

export const POPULATION_RULES = {
  age: defineRule('POPULATION', 'population.age_range', 'minimum_age and maximum_age from ctgov.eligibilities, in years.'),
  hba1c: defineRule('POPULATION', 'population.hba1c_range', 'HbA1c inclusion range read from the inclusion criteria text.'),
  bmi: defineRule('POPULATION', 'population.bmi_range', 'BMI inclusion range read from the inclusion criteria text.'),
  background: defineRule('POPULATION', 'population.background_therapy', 'Background glucose-lowering therapy required by the inclusion criteria.'),
  cvRisk: defineRule('POPULATION', 'population.cv_risk', 'Inclusion criteria require established cardiovascular disease or high cardiovascular risk.'),
  renal: defineRule('POPULATION', 'population.renal', 'Inclusion criteria require chronic kidney disease, albuminuria or reduced eGFR.'),
  baseline: defineRule('POPULATION', 'population.baseline_characteristics', 'Mean age, HbA1c and BMI and percent female from ctgov.baseline_measurements.'),
};

type Row = Record<string, any>;

function years(raw: unknown): number | null {
  const m = String(raw ?? '').match(/(\d+(?:\.\d+)?)\s*(year|month|week|day)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return unit === 'year' ? n : unit === 'month' ? n / 12 : unit === 'week' ? n / 52 : n / 365;
}

/** Text before the exclusion heading. Exclusion criteria describe who is not in the trial. */
export function inclusionText(criteria: string | null | undefined): string {
  const s = (criteria ?? '').toLowerCase();
  const cut = s.search(/exclusion criteria|key exclusion|exclusion:/);
  return cut > 0 ? s.slice(0, cut) : s;
}

const NUM = '(\\d{1,2}(?:\\.\\d{1,2})?)';

function range(text: string, subject: RegExp, plausible: [number, number], unit: string): [number | null, number | null] {
  const ok = (n: number) => n >= plausible[0] && n <= plausible[1];
  for (const m of text.matchAll(new RegExp(subject.source, 'g'))) {
    const window = text.slice(m.index, m.index + 160).split(/\n|;|\. /)[0]!;
    const between = window.match(new RegExp(`${NUM}\\s*${unit}?\\s*(?:-|–|to|and|and\\s*(?:≤|<=|<)|through)\\s*(?:≤|<=|<)?\\s*${NUM}`));
    if (between && ok(Number(between[1])) && ok(Number(between[2])) && Number(between[1]) < Number(between[2])) {
      return [Number(between[1]), Number(between[2])];
    }
    const lower = window.match(new RegExp(`(?:≥|>=|=>|>|at least|greater than(?: or equal to)?|above|of at least)\\s*${NUM}`));
    const upper = window.match(new RegExp(`(?:≤|<=|=<|<|at most|less than(?: or equal to)?|below|no more than|not exceeding)\\s*${NUM}`));
    const lo = lower && ok(Number(lower[1])) ? Number(lower[1]) : null;
    const hi = upper && ok(Number(upper[1])) ? Number(upper[1]) : null;
    if (lo !== null || hi !== null) return [lo, hi !== null && lo !== null && hi <= lo ? null : hi];
  }
  return [null, null];
}

function background(text: string): BackgroundTherapy {
  const naive = /(drug|treatment|medication|insulin)?[- ]?na[iï]ve to (anti-?diabetic|anti-?hyperglyc|glucose[- ]lowering|oral)|\b(drug|treatment)[- ]na[iï]ve|diet and exercise (alone|only)|not (currently )?(receiving|treated with|on) (any )?(anti-?diabetic|anti-?hyperglyc|glucose[- ]lowering)|no (prior|previous) (anti-?diabetic|anti-?hyperglyc)/.test(text);
  const on = (drug: string) => new RegExp(`(treated with|receiving|taking|on|using|stable (dose|doses|regimen) of|inadequately controlled (on|with)|background|add[- ]on to|in combination with|therapy with|monotherapy with)[^.\\n;]{0,80}${drug}|${drug}[^.\\n;]{0,40}(monotherapy|therapy|treatment|background|for at least|at a (stable )?dose|≥ ?\\d+ ?mg)`).test(text);
  const insulin = on('insulin');
  const metformin = on('metformin');
  const su = on('(sulfonylurea|sulphonylurea|glimepiride|glipizide|gliclazide|glyburide)');
  const other = on('(pioglitazone|thiazolidinedione|dpp-?4|sglt-?2|sitagliptin)');
  const oral = metformin || su || other || /oral (anti-?diabetic|anti-?hyperglyc|hypoglyc(a)?emic|glucose[- ]lowering)|\boads?\b|\boha\b/.test(text);
  // "Drug naive or treated with oral agents or insulin" admits every line of therapy.
  const anyLine = /na[iï]ve[^.\n;]{0,60}\bor\b[^.\n;]{0,40}(treated|oral|background|\boads?\b|insulin)|any (background|anti-?diabetic|glucose[- ]lowering) (therapy|treatment)|with or without[^.\n;]{0,60}insulin|insulin[^.\n;]{0,30}(alone or|either alone)/.test(text);
  if (anyLine || (naive && (insulin || oral)) || (insulin && oral && /\bor\b[^.\n;]{0,80}insulin/.test(text))) return 'UNSPECIFIED';
  if (insulin && !/insulin[- ]na[iï]ve/.test(text)) return 'INSULIN';
  if (metformin && (su || other)) return 'DUAL_ORAL';
  if (naive) return 'NAIVE';
  if (metformin) return 'METFORMIN';
  if (su) return 'SU';
  return 'UNSPECIFIED';
}

function baselineMean(rows: Row[], title: RegExp, units?: RegExp): number | null {
  const hits = rows.filter(
    (r) => title.test(String(r.title ?? '').toLowerCase()) && /mean/i.test(String(r.param_type ?? '')) &&
      typeof r.param_value_num === 'number' && (!units || units.test(String(r.units ?? '').toLowerCase())),
  );
  if (hits.length === 0) return null;
  // The "Total" group is posted last. Use it when present, otherwise average the arms.
  const groups = new Map<string, number>();
  for (const r of hits) if (!groups.has(r.ctgov_group_code)) groups.set(r.ctgov_group_code, r.param_value_num);
  const values = [...groups.values()];
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

function femalePct(rows: Row[]): number | null {
  const sex = rows.filter((r) => /^sex/i.test(String(r.title ?? '')) && typeof r.param_value_num === 'number');
  const of = (label: RegExp) => sex.filter((r) => label.test(String(r.category ?? r.classification ?? ''))).reduce((a, r) => a + r.param_value_num, 0);
  const female = of(/^female/i);
  const male = of(/^male/i);
  return female + male > 0 ? Number(((female / (female + male)) * 100).toFixed(1)) : null;
}

const CV_RISK = new RegExp([
  'established (clinical )?(cardiovascular|cv|atherosclerotic|vascular|cardiac)',
  'history of (a )?(myocardial infarction|stroke|coronary|cardiovascular|cv)',
  'high (cardiovascular|cv) risk', 'high risk (for|of) (a )?(cardiovascular|cv)', '(cardiovascular|cv) risk factors?',
  'risk factors? (for|of) (cardiovascular|cv)', 'evidence of (cardiovascular|cv|vascular)', 'evidence or history of athero',
  'coronary artery disease', 'atherosclero', 'peripheral (arter(y|ial)|vascular) disease', 'cerebrovascular disease',
  'acute coronary syndrome', '\\bacs\\b', 'st-segment elevation', 'presence of cardiovascular disease',
  'concomitant cardiovascular', '(cardiovascular|cv) event',
].join('|'));

export function encodePopulation(eligibility: Row | undefined, baselineRows: Row[], conditions: string[] = []): PopulationProfile {
  const text = inclusionText(eligibility?.criteria);
  const [hba1cMin, hba1cMax] = range(text, /hba1c|hb ?a1c|\ba1c\b|glycosylated h(a)?emoglobin|glycated h(a)?emoglobin/, [4.5, 15], '%');
  const [bmiMin, bmiMax] = range(text, /\bbmi\b|body mass index/, [15, 60], '(?:kg ?/ ?m(?:2|²|\\^2))');
  const sex = String(eligibility?.gender ?? 'ALL').toUpperCase();
  return {
    ageMin: years(eligibility?.minimum_age),
    ageMax: years(eligibility?.maximum_age),
    sex: sex === 'FEMALE' || sex === 'MALE' ? sex : 'ALL',
    hba1cMin,
    hba1cMax,
    bmiMin,
    bmiMax,
    background: background(text),
    cvRisk: CV_RISK.test(text) ? 'ESTABLISHED_OR_HIGH' : 'GENERAL',
    renal: /chronic kidney disease|\bckd\b|renal (impairment|insufficiency)|diabetic (nephropathy|kidney disease)|albuminuria|egfr[^.\n;]{0,40}(<|≤|below|less than|between)/.test(text) ? 'CKD' : 'GENERAL',
    // Heart failure is often one of several qualifying conditions. Count it only when the trial is registered for it.
    heartFailure: conditions.some((c) => /heart failure/.test(c.toLowerCase())),
    baseline: {
      ageMean: baselineMean(baselineRows, /^age/, /year/),
      femalePct: femalePct(baselineRows),
      hba1cMean: baselineMean(baselineRows, /hba1c|a1c|glycosylated|glycated/, /%|percent/),
      bmiMean: baselineMean(baselineRows, /body mass index|\bbmi\b/),
    },
  };
}

/** The eligibility part of the profile. Baseline means vary between otherwise identical designs, so they are not hashed. */
export function populationKey(p: PopulationProfile): Omit<PopulationProfile, 'baseline'> {
  const { baseline: _baseline, ...key } = p;
  return key;
}
