// Endpoint ontology for type 2 diabetes cardiovascular outcomes.
//
// Seeded from the MeSH headings attached to the node and from the outcome
// titles that recur across the corpus. A node is a clinical outcome, not a
// string: "change in HbA1c", "HbA1c (%)" and "glycosylated haemoglobin" are one
// node, while 3-point and 4-point MACE are two.
import { timeFrameDays, type Analyte, type EffectMeasure } from '@enigma/core';
import { defineRule } from './registry.js';

export type EndpointKind = 'CONTINUOUS' | 'EVENT';

export interface EndpointDef {
  id: string;
  parent: string | null;
  label: string;
  family: string;
  /** null for abstract grouping nodes, which are never assigned to a record. */
  kind: EndpointKind | null;
  lowerIsBetter: boolean | null;
  analyte?: Analyte;
  /** Requires percent units (true) or non-percent units (false). */
  percentUnits?: boolean;
  include?: RegExp;
  exclude?: RegExp;
  mesh: string[];
}

const N = (def: Omit<EndpointDef, 'mesh'> & { mesh?: string[] }): EndpointDef => ({ mesh: [], ...def });

const HBA1C = /hba1c|hb ?a1c|\ba1c\b|glycosylated h(a)?emoglobin|glycated h(a)?emoglobin|h(a)?emoglobin a1c|glycohemoglobin/;
const WEIGHT = /body ?weight|\bweight\b/;

export const ENDPOINTS: EndpointDef[] = [
  // ---- cardiovascular. Event nodes are assigned by component detection, not by `include`.
  N({ id: 'cv', parent: null, label: 'Cardiovascular outcomes', family: 'cv', kind: null, lowerIsBetter: true, mesh: ['Cardiovascular Diseases'] }),
  N({ id: 'mace', parent: 'cv', label: 'MACE (components not stated)', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'mace-3p', parent: 'mace', label: '3-point MACE (CV death, MI, stroke)', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'mace-4p', parent: 'mace', label: 'Expanded MACE (3-point plus unstable angina, heart failure or revascularization)', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'mace-acm', parent: 'mace', label: 'MACE with all-cause death (death, MI, stroke)', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'death', parent: 'cv', label: 'Mortality', family: 'cv', kind: null, lowerIsBetter: true, mesh: ['Mortality'] }),
  N({ id: 'death-all-cause', parent: 'death', label: 'All-cause mortality', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'death-cv', parent: 'death', label: 'Cardiovascular mortality', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'mi', parent: 'cv', label: 'Myocardial infarction (fatal or non-fatal)', family: 'cv', kind: 'EVENT', lowerIsBetter: true, mesh: ['Myocardial Infarction'] }),
  N({ id: 'mi-nonfatal', parent: 'mi', label: 'Non-fatal myocardial infarction', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'stroke', parent: 'cv', label: 'Stroke (fatal or non-fatal)', family: 'cv', kind: 'EVENT', lowerIsBetter: true, mesh: ['Stroke'] }),
  N({ id: 'stroke-nonfatal', parent: 'stroke', label: 'Non-fatal stroke', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'hhf', parent: 'cv', label: 'Hospitalization for heart failure', family: 'cv', kind: 'EVENT', lowerIsBetter: true, mesh: ['Heart Failure'] }),
  N({ id: 'hhf-cv-death', parent: 'cv', label: 'CV death or hospitalization for heart failure', family: 'cv', kind: 'EVENT', lowerIsBetter: true }),
  N({ id: 'ua-hosp', parent: 'cv', label: 'Hospitalization for unstable angina', family: 'cv', kind: 'EVENT', lowerIsBetter: true, mesh: ['Angina, Unstable'] }),
  N({ id: 'revasc', parent: 'cv', label: 'Coronary revascularization', family: 'cv', kind: 'EVENT', lowerIsBetter: true, mesh: ['Myocardial Revascularization'] }),

  // ---- renal
  N({ id: 'renal', parent: null, label: 'Renal outcomes', family: 'renal', kind: null, lowerIsBetter: true, mesh: ['Diabetic Nephropathies'] }),
  N({ id: 'renal-composite', parent: 'renal', label: 'Composite renal outcome', family: 'renal', kind: 'EVENT', lowerIsBetter: true,
      include: /(renal|kidney|nephropathy) composite|composite (renal|kidney)|doubling of serum creatinine|end[- ]stage (renal|kidney) disease|\besrd\b|\beskd\b|renal death|new or worsening nephropathy|sustained .{0,40}(decrease|decline|reduction) in egfr/ }),
  N({ id: 'egfr-change', parent: 'renal', label: 'Change in eGFR', family: 'renal', kind: 'CONTINUOUS', lowerIsBetter: false, analyte: 'egfr',
      include: /\begfr\b|estimated glomerular filtration|glomerular filtration rate/ }),
  N({ id: 'uacr-change', parent: 'renal', label: 'Change in urinary albumin-to-creatinine ratio', family: 'renal', kind: 'CONTINUOUS', lowerIsBetter: true,
      include: /\buacr\b|albumin[- /](to[- ])?creatinine ratio|urin(e|ary) albumin/ }),

  // ---- glycemic control
  N({ id: 'glycemic', parent: null, label: 'Glycemic control', family: 'glycemic', kind: null, lowerIsBetter: true, mesh: ['Glycemic Control', 'Blood Glucose'] }),
  N({ id: 'hba1c-change', parent: 'glycemic', label: 'HbA1c', family: 'glycemic', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'hba1c',
      include: HBA1C, mesh: ['Glycated Hemoglobin'] }),
  // Abstract: attainment of different thresholds is not one endpoint, so only the two standard thresholds are nodes.
  N({ id: 'hba1c-target', parent: 'glycemic', label: 'HbA1c target attainment', family: 'glycemic', kind: null, lowerIsBetter: false }),
  N({ id: 'hba1c-lt7', parent: 'hba1c-target', label: 'HbA1c below 7.0%', family: 'glycemic', kind: 'EVENT', lowerIsBetter: false,
      include: new RegExp(`(${HBA1C.source}).{0,60}?(<|≤|<=|=<|less than( or equal to)?|below|under|at or below)\\s*7(\\.0)?\\b(?!\\.[1-9])|7(\\.0)?\\s*%? or (less|lower|below)`) }),
  N({ id: 'hba1c-le65', parent: 'hba1c-target', label: 'HbA1c at or below 6.5%', family: 'glycemic', kind: 'EVENT', lowerIsBetter: false,
      include: new RegExp(`(${HBA1C.source}).{0,60}?(<|≤|<=|=<|less than( or equal to)?|below|under|at or below)\\s*6\\.5`) }),
  N({ id: 'fpg-change', parent: 'glycemic', label: 'Fasting plasma glucose', family: 'glycemic', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'glucose',
      include: /fasting (plasma |serum |blood )?glucose|\bfpg\b|\bfsg\b|\bfbg\b|fasting (plasma|blood) sugar/, exclude: /insulin|c-peptide|homa/ }),
  N({ id: 'ppg-change', parent: 'glycemic', label: 'Postprandial glucose', family: 'glycemic', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'glucose',
      include: /post[- ]?prandial (plasma |blood |serum )?glucose|\bppg\b|\bpmg\b|2[- ]?h(ou)?r?s?[- ]post[- ]?(prandial|meal)|post[- ]?meal (plasma )?glucose/, exclude: /excursion|auc|increment/ }),
  N({ id: 'smpg-mean', parent: 'glycemic', label: 'Mean self-monitored glucose profile', family: 'glycemic', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'glucose',
      include: /(self[- ]?(monitored|measured)|\bsmbg\b|\bsmpg\b|[78][- ]point).{0,60}(mean|average|profile)|(mean|average).{0,40}(self[- ]?(monitored|measured)|\bsmbg\b|\bsmpg\b|[78][- ]point)/, exclude: /post[- ]?prandial|increment|bedtime|breakfast|lunch|dinner/ }),
  N({ id: 'rescue-therapy', parent: 'glycemic', label: 'Need for glycemic rescue therapy', family: 'glycemic', kind: 'EVENT', lowerIsBetter: true,
      include: /rescue (medication|therapy|treatment)|glyc(a)?emic rescue|additional anti-?(diabetic|hyperglyc(a)?emic) (medication|therapy)/ }),

  // ---- body weight
  N({ id: 'weight', parent: null, label: 'Body weight', family: 'weight', kind: null, lowerIsBetter: true, mesh: ['Body Weight'] }),
  N({ id: 'weight-change', parent: 'weight', label: 'Body weight (kg)', family: 'weight', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'weight', percentUnits: false,
      include: WEIGHT, exclude: /waist|birth|fat|lean|gain of|loss of (at least|≥|>)|responder|per (kg|kilogram)|insulin dose|dose per|\/ ?kg/ }),
  N({ id: 'weight-change-pct', parent: 'weight', label: 'Body weight (percent change)', family: 'weight', kind: 'CONTINUOUS', lowerIsBetter: true, percentUnits: true,
      include: WEIGHT, exclude: /waist|birth|fat|lean|responder|per (kg|kilogram)|insulin dose|dose per|\/ ?kg/ }),
  N({ id: 'weight-loss-5pct', parent: 'weight', label: 'Weight loss of at least 5%', family: 'weight', kind: 'EVENT', lowerIsBetter: false,
      include: new RegExp(`(${WEIGHT.source}).{0,80}?(≥|>=|at least|more than|greater than( or equal to)?|>)\\s*5(\\.0)?\\s*(%|percent)|(≥|>=|at least|more than|greater than( or equal to)?|>)\\s*5(\\.0)?\\s*(%|percent).{0,60}(${WEIGHT.source})|5\\s*(%|percent) (or more|or greater).{0,40}(${WEIGHT.source})`) }),
  N({ id: 'bmi-change', parent: 'weight', label: 'Body mass index', family: 'weight', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'bmi',
      include: /body mass index|\bbmi\b/ }),
  N({ id: 'waist-change', parent: 'weight', label: 'Waist circumference', family: 'weight', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'length',
      include: /waist circumference|\bwaist\b/, exclude: /hip|ratio/ }),

  // ---- blood pressure
  N({ id: 'bp', parent: null, label: 'Blood pressure', family: 'bp', kind: null, lowerIsBetter: true, mesh: ['Blood Pressure'] }),
  N({ id: 'sbp-change', parent: 'bp', label: 'Systolic blood pressure', family: 'bp', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'pressure',
      include: /systolic|\bsbp\b/, exclude: /diastolic|\bdbp\b|ambulatory|24[- ]h/ }),
  N({ id: 'dbp-change', parent: 'bp', label: 'Diastolic blood pressure', family: 'bp', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'pressure',
      include: /diastolic|\bdbp\b/, exclude: /systolic|\bsbp\b|ambulatory|24[- ]h/ }),

  // ---- lipids
  N({ id: 'lipids', parent: null, label: 'Lipids', family: 'lipids', kind: null, lowerIsBetter: null, mesh: ['Lipids'] }),
  N({ id: 'ldl-change', parent: 'lipids', label: 'LDL cholesterol', family: 'lipids', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'cholesterol', percentUnits: false,
      include: /\bldl\b|ldl[- ]c|low[- ]density lipoprotein/, exclude: /non-?hdl|vldl|particle|ratio|oxidi[sz]ed/ }),
  N({ id: 'hdl-change', parent: 'lipids', label: 'HDL cholesterol', family: 'lipids', kind: 'CONTINUOUS', lowerIsBetter: false, analyte: 'cholesterol', percentUnits: false,
      include: /\bhdl\b|hdl[- ]c|high[- ]density lipoprotein/, exclude: /non[- ]?hdl|ratio|particle/ }),
  N({ id: 'tg-change', parent: 'lipids', label: 'Triglycerides', family: 'lipids', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'triglycerides', percentUnits: false,
      include: /triglyceride|\btg\b/, exclude: /ratio|intrahepatic|liver|hepatic/ }),
  N({ id: 'tc-change', parent: 'lipids', label: 'Total cholesterol', family: 'lipids', kind: 'CONTINUOUS', lowerIsBetter: true, analyte: 'cholesterol', percentUnits: false,
      include: /total cholesterol|\btc\b/, exclude: /ratio/ }),

  // ---- hypoglycemia
  N({ id: 'hypoglycemia', parent: null, label: 'Hypoglycemia (any)', family: 'hypoglycemia', kind: 'EVENT', lowerIsBetter: true, mesh: ['Hypoglycemia'],
      include: /hypoglyc(a)?emi/, exclude: /unaware|fear|rate|per (patient|participant|subject)[- ]year|number of (hypoglyc(a)?emic )?(events|episodes)/ }),
  N({ id: 'hypoglycemia-severe', parent: 'hypoglycemia', label: 'Severe hypoglycemia', family: 'hypoglycemia', kind: 'EVENT', lowerIsBetter: true,
      include: /(severe|major).{0,30}hypoglyc(a)?emi|hypoglyc(a)?emi.{0,30}(severe|major)/, exclude: /non[- ]severe|symptomatic and|and severe|or severe|rate|per (patient|participant|subject)[- ]year/ }),
  N({ id: 'hypoglycemia-symptomatic', parent: 'hypoglycemia', label: 'Documented symptomatic hypoglycemia', family: 'hypoglycemia', kind: 'EVENT', lowerIsBetter: true,
      include: /(documented|confirmed)?.{0,12}symptomatic.{0,20}hypoglyc(a)?emi|hypoglyc(a)?emi.{0,30}symptomatic/, exclude: /asymptomatic|severe|nocturnal|rate|per (patient|participant|subject)[- ]year/ }),
  N({ id: 'hypoglycemia-nocturnal', parent: 'hypoglycemia', label: 'Nocturnal hypoglycemia', family: 'hypoglycemia', kind: 'EVENT', lowerIsBetter: true,
      include: /nocturnal.{0,40}hypoglyc(a)?emi|hypoglyc(a)?emi.{0,40}nocturnal/, exclude: /severe|rate|per (patient|participant|subject)[- ]year/ }),
];

export const ENDPOINT_BY_ID = new Map(ENDPOINTS.map((e) => [e.id, e]));

export function endpointDepth(id: string): number {
  let depth = 0;
  for (let node = ENDPOINT_BY_ID.get(id); node?.parent; node = ENDPOINT_BY_ID.get(node.parent)) depth += 1;
  return depth;
}

export function endpointPath(id: string): string[] {
  const path: string[] = [];
  for (let node = ENDPOINT_BY_ID.get(id); node; node = node.parent ? ENDPOINT_BY_ID.get(node.parent) : undefined) path.unshift(node.id);
  return path;
}

/**
 * The block an endpoint is compared within: its highest ancestor that is not an
 * abstract family root. 3-point and 4-point MACE share the group "mace", so the
 * gate sees that pair and records why it fails. HbA1c and fasting glucose do not.
 */
export function endpointGroup(id: string): string {
  const path = endpointPath(id);
  const root = ENDPOINT_BY_ID.get(path[0]!);
  return root && root.kind === null && path.length > 1 ? path[1]! : path[0]!;
}

const R = {
  cv: defineRule('ENDPOINT', 'endpoint.cv_components', 'Cardiovascular event outcomes are assigned from the set of components named in the title: CV death, all-cause death, MI, stroke, heart failure hospitalization, unstable angina, revascularization.'),
  pattern: defineRule('ENDPOINT', 'endpoint.title_pattern', 'Outcome title matches the node pattern, the measure kind matches the node kind, and no deeper node matches.'),
  classification: defineRule('ENDPOINT', 'endpoint.classification_pattern', 'The measurement classification names the endpoint (for example a lipid panel posted as one outcome with a row per analyte).'),
  ambiguous: defineRule('ENDPOINT', 'endpoint.ambiguous', 'The title matches more than one node at the same depth.'),
  unmapped: defineRule('ENDPOINT', 'endpoint.unmapped', 'The title matches no node in the ontology.'),
  baseline: defineRule('ENDPOINT', 'endpoint.classification_baseline', 'The row is the baseline value, not an outcome.'),
  subgroup: defineRule('ENDPOINT', 'endpoint.classification_unrecognized', 'The classification is neither a visit nor an endpoint. It is probably a subgroup or category, so the row is not comparable to a whole-trial result.'),
};

const COMPONENTS: [string, RegExp][] = [
  ['cvDeath', /(cardiovascular|\bcv\b|cardiac)[- ]?(related )?(death|mortality)|death (from|due to) (a )?(cardiovascular|cv|cardiac)/],
  ['mi', /myocardial infarction|\bmi\b|heart attack/],
  ['stroke', /\bstroke\b|cerebrovascular accident/],
  ['hhf', /hospitali[sz](ation|ed) (for|due to|with) (congestive )?(heart failure|\bhf\b|\bchf\b)|(heart failure|\bhf\b) (requiring |leading to )?hospitali[sz]ation|\bhhf\b/],
  ['ua', /unstable angina/],
  ['revasc', /revasculari[sz]ation/],
];
const ALL_DEATH = /all[- ]cause (death|mortality)|death (from|due to|of) any cause|any[- ]cause (death|mortality)|overall mortality|total mortality|\bdeaths?\b|\bmortality\b/;
const MACE = /\bmace\b|major adverse (cardiac|cardiovascular|cardio-vascular) events?/;

function cvNode(text: string): string | null {
  const found = new Set(COMPONENTS.filter(([, p]) => p.test(text)).map(([k]) => k));
  if (!found.has('cvDeath') && ALL_DEATH.test(text)) found.add('allDeath');
  const has = (...keys: string[]) => keys.every((k) => found.has(k));
  const size = found.size;
  const nonfatal = /non[- ]?fatal/.test(text);

  if (has('cvDeath', 'mi', 'stroke')) return size === 3 ? 'mace-3p' : 'mace-4p';
  if (has('allDeath', 'mi', 'stroke')) return size === 3 ? 'mace-acm' : 'mace-4p';
  if (/expanded (composite )?(cardiovascular|cv|mace)/.test(text) && !/each individual component/.test(text)) return 'mace-4p';
  if (MACE.test(text)) {
    if (/3[- ]?point|3p[- ]?mace|three[- ]point/.test(text)) return 'mace-3p';
    if (/4[- ]?point|4p[- ]?mace|four[- ]point|mace[- ]?plus|expanded mace/.test(text)) return 'mace-4p';
    return 'mace';
  }
  if (size === 2 && has('cvDeath', 'hhf')) return 'hhf-cv-death';
  // A composite that names only one recognized component is not that component.
  if (size === 1 && !/composite|combined|each individual component|any of the following/.test(text)) {
    if (has('cvDeath')) return 'death-cv';
    if (has('allDeath')) return 'death-all-cause';
    if (has('mi')) return nonfatal ? 'mi-nonfatal' : 'mi';
    if (has('stroke')) return nonfatal ? 'stroke-nonfatal' : 'stroke';
    if (has('hhf')) return 'hhf';
    if (has('ua')) return 'ua-hosp';
    if (has('revasc')) return 'revasc';
  }
  return null;
}

const kindOf = (measure: EffectMeasure): EndpointKind => (measure === 'MD' || measure === 'SMD' ? 'CONTINUOUS' : 'EVENT');
const isPercent = (units: string | null) => /%|percent/.test((units ?? '').toLowerCase());

function patternNodes(text: string, kind: EndpointKind, units: string | null, analyteOnly = false): EndpointDef[] {
  const matches = ENDPOINTS.filter((e) => {
    if (e.kind !== kind || !e.include || !e.include.test(text) || e.exclude?.test(text)) return false;
    // HbA1c is itself a percentage, so the percent test is skipped for it.
    if (!analyteOnly && e.percentUnits !== undefined && e.percentUnits !== isPercent(units)) return false;
    return true;
  });
  // drop any node that has a matching descendant
  return matches.filter((e) => !matches.some((other) => other !== e && endpointPath(other.id).includes(e.id)));
}

export type ClassificationRole = 'NONE' | 'VISIT' | 'NEUTRAL' | 'ENDPOINT' | 'BASELINE' | 'UNRECOGNIZED';

export interface EndpointDecision {
  nodeId: string | null;
  rule: string;
  /** Why no node was assigned. */
  reason: 'UNMAPPED' | 'AMBIGUOUS' | 'CLASSIFICATION_BASELINE' | 'CLASSIFICATION_UNRECOGNIZED' | 'UNIT_NOT_OF_ANALYTE' | null;
  classificationRole: ClassificationRole;
  /** Follow-up read from the classification when it is a visit ("Week 24"). */
  classificationDays: number | null;
  matchedOn: string;
}

/** "Age < 65 years" and "diabetes duration 10 years" contain durations but are subgroups, not visits. */
const SUBGROUP_HINT = /\bage\b|\baged\b|\bold\b|duration|history|since|onset|[<>≤≥]/;
const NEUTRAL = /^(change from baseline|change|overall|total|all|all participants|endpoint|end ?point|end of (treatment|study)|final( visit)?|last observation.*|locf|observed|adjusted mean change|mean change|lsm?( mean)? change.*|yes)$/;

export function classifyEndpoint(input: {
  title: string;
  classification: string | null;
  measure: EffectMeasure;
  units: string | null;
}): EndpointDecision {
  // "Cardiovascular (CV) Death" -> "cardiovascular death": drop bracketed abbreviations before matching.
  const title = input.title.toLowerCase().replace(/\s*\(([a-z0-9-]{1,10})\)/g, ' ').replace(/\s+/g, ' ');
  const cls = (input.classification ?? '').toLowerCase().trim();
  const kind = kindOf(input.measure);

  let role: ClassificationRole = 'NONE';
  let days: number | null = null;
  let classNodes: EndpointDef[] = [];
  if (cls) {
    days = timeFrameDays(cls);
    classNodes = patternNodes(cls, kind, input.units);
    if (classNodes.length === 1) role = 'ENDPOINT';
    else if (days !== null && !SUBGROUP_HINT.test(cls)) role = 'VISIT';
    else if (/^baseline\b|\bat baseline$|^pre[- ]?(dose|treatment)$|^day 0$|^week 0$/.test(cls)) role = 'BASELINE';
    else if (NEUTRAL.test(cls)) role = 'NEUTRAL';
    else role = 'UNRECOGNIZED';
  }
  const base = { classificationRole: role, classificationDays: role === 'VISIT' ? days : null };

  // Baseline tables are sometimes posted as outcomes.
  if (/demographic|baseline characteristic/.test(title)) return { ...base, nodeId: null, rule: R.unmapped, reason: 'UNMAPPED', matchedOn: title };
  if (role === 'BASELINE') return { ...base, nodeId: null, rule: R.baseline, reason: 'CLASSIFICATION_BASELINE', matchedOn: cls };
  if (role === 'ENDPOINT') return { ...base, nodeId: classNodes[0]!.id, rule: R.classification, reason: null, matchedOn: cls };
  if (role === 'UNRECOGNIZED') return { ...base, nodeId: null, rule: R.subgroup, reason: 'CLASSIFICATION_UNRECOGNIZED', matchedOn: cls };

  if (kind === 'EVENT') {
    // A renal composite often lists "renal or CV death" as a component. It is still a renal endpoint.
    const renal = ENDPOINT_BY_ID.get('renal-composite')!;
    if (renal.include!.test(title) && !MACE.test(title)) return { ...base, nodeId: renal.id, rule: R.pattern, reason: null, matchedOn: title };
    const cv = cvNode(title);
    if (cv && !/hypoglyc/.test(title)) return { ...base, nodeId: cv, rule: R.cv, reason: null, matchedOn: title };
  }
  const nodes = patternNodes(title, kind, input.units);
  if (nodes.length === 1) return { ...base, nodeId: nodes[0]!.id, rule: R.pattern, reason: null, matchedOn: title };
  if (nodes.length > 1) return { ...base, nodeId: null, rule: R.ambiguous, reason: 'AMBIGUOUS', matchedOn: title };
  return { ...base, nodeId: null, rule: R.unmapped, reason: 'UNMAPPED', matchedOn: title };
}
