import { titleCase } from './format';

// Screen names for the engine's vocabulary. The claim store, the API and exported dossiers keep the roadmap terms.

export const TYPES = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;

const TYPE_NAME: Record<string, string> = {
  C1: 'Opposite Directions',
  C2: 'Size Mismatch',
  C3: 'Effect vs. No Effect',
  C4: 'Unexplained Spread',
  C5: 'Reversed Over Time',
};

const DIMENSION_NAME: Record<string, string> = {
  endpoint: 'Endpoint',
  measure: 'Statistic',
  population: 'Patients',
  intervention: 'Treatment',
  comparator: 'Control Arm',
  timepoint: 'Follow-Up',
  analysisPopulation: 'Analysis Set',
  direction: 'Direction',
};

const VARIABLE_NAME: Record<string, string> = {
  'baseline age': 'Patient Age',
  'completion year': 'Trial Year',
  'follow-up length': 'Follow-Up',
  'follow-up (days)': 'Follow-Up',
  'analysis population': 'Analysis Set',
  'background therapy': 'Background Drug',
  'comparator-arm risk': 'Control-Arm Risk',
  'log sample size': 'Trial Size',
};

export const typeName = (type: string): string => TYPE_NAME[type] ?? type;
export const dimensionName = (dimension: string | null | undefined, fallback?: string): string => (dimension && DIMENSION_NAME[dimension]) || fallback || titleCase(dimension);

/** "baseline age, which accounts for part of the spread (slope p = 0.17)" -> "Patient Age" */
export function variableName(raw: string): string {
  const name = raw.replace(/,.*$/, '').trim();
  return VARIABLE_NAME[name.toLowerCase()] ?? titleCase(name);
}

/** "AS_TREATED" -> "As Treated", "METFORMIN" -> "Metformin". Short codes such as ITT are kept. */
const plainValue = (v: string): string => (/^[A-Z_]{5,}$/.test(v) ? titleCase(v) : v);

/** "57 years", "64 years" -> "57 vs 64 years" */
export function variableValues(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a || !b) return plainValue(a ?? b ?? '');
  const [, an, au] = a.match(/^(\S+)\s+(.+)$/) ?? [];
  const [, bn, bu] = b.match(/^(\S+)\s+(.+)$/) ?? [];
  if (au && au === bu) return `${an} vs ${bn} ${au}`;
  return `${plainValue(a)} vs ${plainValue(b)}`;
}

/** Unit as printed after a mean difference: "%" attaches, everything else takes a space. */
export function unitSuffix(unit: string | null | undefined): string {
  if (!unit) return '';
  if (unit === '%') return '%';
  if (unit.toLowerCase() === 'percentage change') return ' % change';
  return ` ${unit.replace(/m2\b/, 'm²')}`;
}
