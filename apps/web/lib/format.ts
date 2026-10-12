const int = new Intl.NumberFormat('en-US');

export const n = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : int.format(v));
export const pct = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(digits)}%`);
export const score = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : v.toFixed(2));

export function followUp(days: number | null | undefined): string {
  if (!days) return 'n/a';
  return days >= 540 ? `${(days / 365.25).toFixed(1)} y` : `${Math.round(days / 7)} wk`;
}

export function pValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'n/a';
  if (v < 0.0001) return v.toExponential(1);
  return v.toFixed(4);
}

export const isRatio = (measure: string): boolean => measure === 'HR' || measure === 'OR' || measure === 'RR';

const SMALL = new Set(['of', 'or', 'and', 'to', 'at', 'in', 'for', 'by', 'with', 'vs', 'a', 'an', 'the']);

/** "PLACEBO_COMPARATOR" or "standard of care" -> "Placebo Comparator", "Standard of Care". Words with a digit or inner capital are kept. */
export function titleCase(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map((w, i) => {
      if (/\d/.test(w) || /[a-z][A-Z]/.test(w)) return w;
      const lower = w === w.toUpperCase() ? w.toLowerCase() : w;
      if (i > 0 && SMALL.has(lower.toLowerCase())) return lower.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** "NCT01106651, Canagliflozin 300 mg vs Placebo" -> ["NCT01106651", "Canagliflozin 300 mg vs Placebo"] */
export function splitLabel(label: string): [string, string] {
  const at = label.indexOf(', ');
  return at < 0 ? [label, ''] : [label.slice(0, at), label.slice(at + 2)];
}

/** "PHASE2/PHASE3" -> "Phase 2/3" */
export function phase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split('/').map((p) => p.replace(/EARLY_/i, 'Early ').replace(/PHASE/i, '').trim());
  return raw.toUpperCase() === 'NA' ? null : `Phase ${parts.join('/')}`;
}
