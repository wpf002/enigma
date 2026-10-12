const UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1, d: 1,
  week: 7, weeks: 7, wk: 7, wks: 7, w: 7,
  month: 30.4375, months: 30.4375, mo: 30.4375, mos: 30.4375,
  year: 365.25, years: 365.25, yr: 365.25, yrs: 365.25,
};

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

/**
 * Follow-up length in days from a ClinicalTrials.gov time_frame string.
 * Takes the longest duration named: "Baseline, Week 12 and Week 24" -> 168.
 * Returns null when no duration can be read.
 */
export function timeFrameDays(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[-–]/g, ' ');
  const found: number[] = [];
  const unit = '(days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?)';
  const number = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).join('|')})`;
  // "24 weeks", "4.6 years", "twelve months"
  for (const m of s.matchAll(new RegExp(`\\b${number}\\s*${unit}\\b`, 'g'))) {
    const n = WORDS[m[1]!] ?? Number(m[1]);
    found.push(n * UNIT_DAYS[m[2]!]!);
  }
  // "week 24", "month 6", "day 1"
  for (const m of s.matchAll(new RegExp(`\\b${unit}\\s*(\\d+(?:\\.\\d+)?)\\b`, 'g'))) {
    found.push(Number(m[2]) * UNIT_DAYS[m[1]!]!);
  }
  const valid = found.filter((d) => Number.isFinite(d) && d > 0);
  return valid.length ? Math.round(Math.max(...valid)) : null;
}
