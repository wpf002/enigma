const int = new Intl.NumberFormat('en-US');

export const n = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : int.format(v));
export const pct = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(digits)}%`);
export const score = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : v.toFixed(2));

export function followUp(days: number | null | undefined): string {
  if (!days) return 'not recorded';
  return days >= 540 ? `${(days / 365.25).toFixed(1)} years` : `${Math.round(days / 7)} weeks`;
}

export function pValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'n/a';
  if (v < 0.0001) return v.toExponential(1);
  return v.toFixed(4);
}

export const isRatio = (measure: string): boolean => measure === 'HR' || measure === 'OR' || measure === 'RR';

export const TYPE_BLURB: Record<string, string> = {
  C1: 'Opposite directions, both intervals exclude the null.',
  C2: 'Same direction, disjoint intervals.',
  C3: 'One shows an effect. The other is null and excludes it.',
  C4: 'A cluster with heterogeneity no moderator accounts for.',
  C5: 'A pooled estimate that crossed the null over time.',
};
