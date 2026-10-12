/** Effect measures Enigma stores. Anything else is rejected at normalization. */
export const EFFECT_MEASURES = ['OR', 'RR', 'RD', 'HR', 'MD', 'SMD'] as const;
export type EffectMeasure = (typeof EFFECT_MEASURES)[number];

/** Ratios are analysed on the log scale and have a null value of 1. */
export const RATIO_MEASURES: readonly EffectMeasure[] = ['OR', 'RR', 'HR'];

/**
 * Which arm is the numerator / minuend. Every stored record uses the
 * experimental arm first. Records whose reported orientation could not be
 * established keep `directionResolved = false` and fail the gate.
 */
export type DirectionConvention = 'EXPERIMENTAL_OVER_COMPARATOR' | 'EXPERIMENTAL_MINUS_COMPARATOR';

export type DispersionType = 'CI' | 'SE' | 'P_VALUE' | 'ARM_LEVEL';

/**
 * An effect size. Never passed around as a bare number: the measure, the
 * interval, the sample size and the direction convention travel with the value.
 */
export interface EffectSize {
  readonly measure: EffectMeasure;
  readonly value: number;
  readonly ciLow: number;
  readonly ciHigh: number;
  /** Confidence level of ciLow/ciHigh, e.g. 0.95. */
  readonly ciLevel: number;
  /** Standard error on the analysis scale (log scale for ratios). */
  readonly se: number;
  readonly n: number | null;
  /** How the uncertainty was obtained. */
  readonly dispersionType: DispersionType;
  readonly directionConvention: DirectionConvention;
  readonly directionResolved: boolean;
  /** True when a smaller value of the outcome is the better clinical result. */
  readonly lowerIsBetter: boolean | null;
}

export const isRatio = (measure: EffectMeasure): boolean => RATIO_MEASURES.includes(measure);

export const nullValue = (measure: EffectMeasure): number => (isRatio(measure) ? 1 : 0);

export const conventionFor = (measure: EffectMeasure): DirectionConvention =>
  isRatio(measure) ? 'EXPERIMENTAL_OVER_COMPARATOR' : 'EXPERIMENTAL_MINUS_COMPARATOR';

export class InvalidEffectError extends Error {
  override name = 'InvalidEffectError';
}

/** The only way to build an EffectSize. Rejects values that cannot be an effect of that measure. */
export function effectSize(input: EffectSize): EffectSize {
  const { measure, value, ciLow, ciHigh, ciLevel, se } = input;
  if (!EFFECT_MEASURES.includes(measure)) throw new InvalidEffectError(`unknown measure ${String(measure)}`);
  for (const [name, v] of [['value', value], ['ciLow', ciLow], ['ciHigh', ciHigh], ['se', se]] as const) {
    if (!Number.isFinite(v)) throw new InvalidEffectError(`${name} is not finite`);
  }
  if (isRatio(measure) && (value <= 0 || ciLow <= 0)) throw new InvalidEffectError(`${measure} must be positive`);
  if (!(ciLow <= value && value <= ciHigh)) throw new InvalidEffectError('interval does not contain the estimate');
  if (!(ciLevel > 0 && ciLevel < 1)) throw new InvalidEffectError('ciLevel must be in (0, 1)');
  if (se <= 0) throw new InvalidEffectError('se must be positive');
  if (input.directionConvention !== conventionFor(measure)) {
    throw new InvalidEffectError(`${measure} must use ${conventionFor(measure)}`);
  }
  return Object.freeze({ ...input });
}

/** "HR 0.86 (95% CI 0.74 to 0.99)", or "MD -7.89 mmHg (95% CI -10.14 to -5.64)" when a unit is given. Display only. */
export function formatEffect(
  effect: Pick<EffectSize, 'measure' | 'value' | 'ciLow' | 'ciHigh' | 'ciLevel'>,
  unit?: string | null,
): string {
  const d = isRatio(effect.measure) ? 2 : Math.abs(effect.value) < 10 ? 2 : 1;
  const pct = Math.round(effect.ciLevel * 100);
  const u = unit && !isRatio(effect.measure) ? ` ${unit}` : '';
  return `${effect.measure} ${effect.value.toFixed(d)}${u} (${pct}% CI ${effect.ciLow.toFixed(d)} to ${effect.ciHigh.toFixed(d)})`;
}
