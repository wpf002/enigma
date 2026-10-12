// Unit algebra for the continuous outcomes in the v1 therapeutic area.
// Conversions are linear. A *difference* between two values scales by the
// factor only; the offset cancels. Effect sizes are always differences, so
// `differenceFactor` is what the normalizer applies to value and interval.

export type Analyte =
  | 'hba1c' | 'glucose' | 'cholesterol' | 'triglycerides' | 'weight' | 'length'
  | 'pressure' | 'creatinine' | 'bmi' | 'egfr';

export interface UnitDef {
  analyte: Analyte;
  /** Canonical unit of the analyte. */
  canonical: string;
  /** canonical = value * factor + offset */
  factor: number;
  offset: number;
}

const U = (analyte: Analyte, canonical: string, factor = 1, offset = 0): UnitDef => ({ analyte, canonical, factor, offset });

/** Keyed by `${analyte}:${normalized unit}`. */
const UNITS: Record<string, UnitDef> = {
  // HbA1c: NGSP % is canonical. IFCC mmol/mol = (NGSP - 2.15) * 10.929
  'hba1c:%': U('hba1c', '%'),
  'hba1c:mmol/mol': U('hba1c', '%', 1 / 10.929, 2.15),
  // glucose: mmol/L canonical, 1 mmol/L = 18.016 mg/dL
  'glucose:mmol/l': U('glucose', 'mmol/L'),
  'glucose:mg/dl': U('glucose', 'mmol/L', 1 / 18.016),
  // cholesterol (LDL, HDL, total): 1 mmol/L = 38.67 mg/dL
  'cholesterol:mmol/l': U('cholesterol', 'mmol/L'),
  'cholesterol:mg/dl': U('cholesterol', 'mmol/L', 1 / 38.67),
  // triglycerides: 1 mmol/L = 88.57 mg/dL
  'triglycerides:mmol/l': U('triglycerides', 'mmol/L'),
  'triglycerides:mg/dl': U('triglycerides', 'mmol/L', 1 / 88.57),
  'weight:kg': U('weight', 'kg'),
  'weight:g': U('weight', 'kg', 0.001),
  'weight:lb': U('weight', 'kg', 0.45359237),
  'length:cm': U('length', 'cm'),
  'length:mm': U('length', 'cm', 0.1),
  'length:in': U('length', 'cm', 2.54),
  'pressure:mmhg': U('pressure', 'mmHg'),
  'creatinine:umol/l': U('creatinine', 'umol/L'),
  'creatinine:mg/dl': U('creatinine', 'umol/L', 88.42),
  'bmi:kg/m2': U('bmi', 'kg/m2'),
  'egfr:ml/min/1.73m2': U('egfr', 'mL/min/1.73m2'),
};

const ALIASES: [RegExp, string][] = [
  [/^(percent(age)?( of)?( glycosylated| glycated)?( hemoglobin| haemoglobin| hba1c)?|%( hba1c| a1c)?|percent(age)? point(s)?|hba1c ?%|% of total hemoglobin)$/, '%'],
  [/^mmol ?\/ ?mol$/, 'mmol/mol'],
  [/^mmol ?\/ ?(l|liter|litre)$/, 'mmol/l'],
  [/^(mg ?\/ ?dl|milligrams? per deciliter|mg per dl|mg ?\/ ?100 ?ml)$/, 'mg/dl'],
  [/^(kg|kilograms?|kgs)$/, 'kg'],
  [/^(g|grams?)$/, 'g'],
  [/^(lb|lbs|pounds?)$/, 'lb'],
  [/^(cm|centimeters?|centimetres?)$/, 'cm'],
  [/^(mm|millimeters?)$/, 'mm'],
  [/^(in|inch|inches)$/, 'in'],
  [/^(mm ?hg|millimeters? of mercury)$/, 'mmhg'],
  [/^(umol ?\/ ?l|µmol ?\/ ?l|micromol(es)? ?\/ ?l)$/, 'umol/l'],
  [/^kg ?\/ ?m(\^?2|²)$/, 'kg/m2'],
  [/^ml ?\/ ?min ?(\/|per) ?1\.73 ?m(\^?2|²)$/, 'ml/min/1.73m2'],
];

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [pattern, unit] of ALIASES) if (pattern.test(s)) return unit;
  return null;
}

export function unitFor(analyte: Analyte, rawUnit: string | null | undefined): UnitDef | null {
  const unit = normalizeUnit(rawUnit);
  return unit ? (UNITS[`${analyte}:${unit}`] ?? null) : null;
}

/** Converts an absolute value to the analyte's canonical unit. */
export function toCanonical(value: number, unit: UnitDef): number {
  return value * unit.factor + unit.offset;
}

/** Multiplier that converts a difference (an effect size) to the canonical unit. */
export function differenceFactor(unit: UnitDef): number {
  return unit.factor;
}
