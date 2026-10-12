import type { EffectMeasure } from '@enigma/core';
import { defineRule } from './registry.js';

export type OutcomeKind = 'BINARY' | 'CONTINUOUS' | 'TIME_TO_EVENT' | 'UNKNOWN';

export interface MeasureDecision {
  measure: EffectMeasure;
  logScale: boolean;
  rule: string;
}

export interface MeasureRejection {
  reason: 'NO_PARAM_TYPE' | 'UNSUPPORTED_PARAM_TYPE';
  rule: string;
}

const R = {
  hr: defineRule('MEASURE', 'measure.hazard_ratio', 'param_type names a hazard ratio or a Cox model.'),
  or: defineRule('MEASURE', 'measure.odds_ratio', 'param_type names an odds ratio.'),
  rr: defineRule('MEASURE', 'measure.risk_ratio', 'param_type names a risk ratio or relative risk.'),
  rd: defineRule('MEASURE', 'measure.risk_difference', 'param_type names a risk difference, or a difference on a binary outcome.'),
  md: defineRule('MEASURE', 'measure.mean_difference', 'param_type names a difference in means on a continuous outcome.'),
  none: defineRule('MEASURE', 'measure.missing', 'The analysis posts no estimate type.'),
  unsupported: defineRule('MEASURE', 'measure.unsupported', 'Estimate type Enigma does not store: medians, geometric mean ratios, slopes, rate ratios, single-arm means.'),
};

/** Maps the free-text ctgov.outcome_analyses.param_type to an effect measure. */
export function classifyMeasure(paramType: string | null | undefined, outcomeKind: OutcomeKind): MeasureDecision | MeasureRejection {
  const s = (paramType ?? '').toLowerCase().trim();
  if (!s) return { reason: 'NO_PARAM_TYPE', rule: R.none };
  const logScale = /\blog\b|\bln\b/.test(s);

  if (/median|geometric|ratio of (ls |least squares )?means|slope|correlation|rate ratio|incidence rate|percent change|% change/.test(s)) {
    return { reason: 'UNSUPPORTED_PARAM_TYPE', rule: R.unsupported };
  }
  if (/hazard ratio|\bhr\b|cox/.test(s)) return { measure: 'HR', logScale, rule: R.hr };
  if (/odds[ -]ratio/.test(s)) return { measure: 'OR', logScale, rule: R.or };
  if (/risk ratio|relative risk/.test(s)) return { measure: 'RR', logScale, rule: R.rr };
  if (/risk difference|difference in (proportion|percentage|percent|rate)s?|proportion difference/.test(s)) {
    return { measure: 'RD', logScale: false, rule: R.rd };
  }
  if (/difference|treatment effect|estimated treatment|contrast|\bdiff\b|\betd\b/.test(s)) {
    if (outcomeKind === 'BINARY') return { measure: 'RD', logScale: false, rule: R.rd };
    if (outcomeKind === 'CONTINUOUS') return { measure: 'MD', logScale: false, rule: R.md };
  }
  return { reason: 'UNSUPPORTED_PARAM_TYPE', rule: R.unsupported };
}

export interface ArmDataKind {
  outcomeKind: OutcomeKind;
  armParam: 'COUNT' | 'PERCENT' | 'MEAN' | null;
  armDispersion: 'SD' | 'SE' | 'CI' | null;
  armCiLevel: number | null;
}

const token = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Reads ctgov.outcomes param_type / dispersion_type / units into the kind of arm-level data posted. */
export function classifyArmData(paramType: string | null, dispersionType: string | null, units: string | null): ArmDataKind {
  const p = token(paramType);
  const d = token(dispersionType);
  const u = (units ?? '').toLowerCase();
  const participantUnits = /(participant|patient|subject|responder)s?\b/.test(u);

  let armDispersion: ArmDataKind['armDispersion'] = null;
  let armCiLevel: number | null = null;
  if (d === 'STANDARD_DEVIATION') armDispersion = 'SD';
  else if (d === 'STANDARD_ERROR') armDispersion = 'SE';
  else {
    const ci = d.match(/^(\d+(?:_\d+)?)_CONFIDENCE_INTERVAL$/) ?? d.match(/^CONFIDENCE_(\d+)$/);
    if (ci) {
      armDispersion = 'CI';
      armCiLevel = Number(ci[1]!.replace('_', '.')) / 100;
    }
  }

  if (p === 'COUNT_OF_PARTICIPANTS') return { outcomeKind: 'BINARY', armParam: 'COUNT', armDispersion: null, armCiLevel: null };
  if (p === 'NUMBER' && participantUnits) {
    const percent = /percent|%|proportion/.test(u);
    return { outcomeKind: 'BINARY', armParam: percent ? 'PERCENT' : 'COUNT', armDispersion: null, armCiLevel: null };
  }
  if (p === 'MEAN' || p === 'LEAST_SQUARES_MEAN') {
    return { outcomeKind: 'CONTINUOUS', armParam: 'MEAN', armDispersion, armCiLevel };
  }
  return { outcomeKind: 'UNKNOWN', armParam: null, armDispersion: null, armCiLevel: null };
}
