import { differenceFactor, unitFor, type Analyte, type UnitDef } from '@enigma/core';
import { defineRule } from './registry.js';

export const UNIT_RULE = defineRule('UNIT', 'unit.rescale_to_canonical', 'Mean differences are rescaled to the canonical unit of the endpoint analyte.');
export const UNIT_MISMATCH_RULE = defineRule('UNIT', 'unit.not_of_analyte', 'The posted unit is not a unit of the endpoint analyte (a questionnaire score under a title that mentions body weight). The record is not assigned to the node.');
export const SIGN_WORDING_RULE = defineRule('DIRECTION', 'direction.outcome_sign_wording', 'The outcome is titled as a reduction, decrease or loss rather than a change. Whether a positive value means more or less of the analyte cannot be read from the record.');
export const UNIT_UNKNOWN_RULE = defineRule('UNIT', 'unit.unrecognized', 'The posted unit is not one the unit table converts. The record keeps its unit and is only comparable to records with the same unit string.');

/** Units are free text in ClinicalTrials.gov. These catch the spellings the exact table in @enigma/core misses. */
const LENIENT: Record<Analyte, [RegExp, string][]> = {
  hba1c: [[/mmol ?\/ ?mol/, 'mmol/mol'], [/%|percent/, '%']],
  glucose: [[/mmol/, 'mmol/l'], [/mg/, 'mg/dl']],
  cholesterol: [[/mmol/, 'mmol/l'], [/mg/, 'mg/dl']],
  triglycerides: [[/mmol/, 'mmol/l'], [/mg/, 'mg/dl']],
  weight: [[/kg|kilogram/, 'kg'], [/\blbs?\b|pound/, 'lb']],
  length: [[/\bcm\b|centimet/, 'cm'], [/\binch/, 'in']],
  pressure: [[/mm ?hg/, 'mmhg']],
  creatinine: [[/[uµμ]mol/, 'umol/l'], [/mg/, 'mg/dl']],
  bmi: [[/kg ?\/ ?m/, 'kg/m2']],
  egfr: [[/ml ?\/ ?min/, 'ml/min/1.73m2']],
};

export interface UnitResolution {
  /** Multiplier for value, interval limits, SE and pooled SD. */
  factor: number;
  /** Canonical unit, or the cleaned posted unit when it is not recognized. */
  unit: string;
  recognized: boolean;
}

export function resolveUnit(analyte: Analyte | undefined, raw: string | null): UnitResolution {
  const cleaned = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (analyte) {
    let def: UnitDef | null = unitFor(analyte, raw);
    if (!def) {
      for (const [pattern, unit] of LENIENT[analyte]) {
        if (pattern.test(cleaned)) {
          def = unitFor(analyte, unit);
          break;
        }
      }
    }
    if (def) return { factor: differenceFactor(def), unit: def.canonical, recognized: true };
  }
  return { factor: 1, unit: cleaned || 'unspecified', recognized: false };
}
