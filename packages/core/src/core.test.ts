import { describe, expect, it } from 'vitest';
import {
  differenceFactor, effectSize, normalizeUnit, renderClaim, timeFrameDays, toCanonical, unitFor, type Claim, type EffectSize,
} from './index.js';

const hr: EffectSize = {
  measure: 'HR', value: 0.86, ciLow: 0.74, ciHigh: 0.99, ciLevel: 0.95, se: 0.0743, n: 7020,
  dispersionType: 'CI', directionConvention: 'EXPERIMENTAL_OVER_COMPARATOR', directionResolved: true, lowerIsBetter: true,
};

describe('effectSize', () => {
  it('accepts a well-formed hazard ratio', () => {
    expect(effectSize(hr).value).toBe(0.86);
  });
  it('rejects a non-positive ratio, an interval that misses the estimate and a wrong convention', () => {
    expect(() => effectSize({ ...hr, value: -0.2, ciLow: -0.4 })).toThrow(/positive/);
    expect(() => effectSize({ ...hr, ciLow: 0.9 })).toThrow(/interval/);
    expect(() => effectSize({ ...hr, directionConvention: 'EXPERIMENTAL_MINUS_COMPARATOR' })).toThrow(/must use/);
  });
});

describe('units', () => {
  it('normalizes unit spellings', () => {
    expect(normalizeUnit('Percentage of glycosylated hemoglobin')).toBe('%');
    expect(normalizeUnit('mg/dL')).toBe('mg/dl');
    expect(normalizeUnit('kg/m^2')).toBe('kg/m2');
    expect(normalizeUnit('participants')).toBeNull();
  });
  it('converts glucose and HbA1c, applying the offset to values but not to differences', () => {
    const mgdl = unitFor('glucose', 'mg/dL')!;
    expect(toCanonical(180.16, mgdl)).toBeCloseTo(10, 3);
    const ifcc = unitFor('hba1c', 'mmol/mol')!;
    expect(toCanonical(53, ifcc)).toBeCloseTo(7.0, 1);
    expect(-11 * differenceFactor(ifcc)).toBeCloseTo(-1.006, 2);
  });
});

describe('timeFrameDays', () => {
  it('reads the longest named duration', () => {
    expect(timeFrameDays('Baseline, Week 12 and Week 24')).toBe(168);
    expect(timeFrameDays('From randomisation to individual end of observation, up to 4.6 years')).toBe(1680);
    expect(timeFrameDays('26 weeks')).toBe(182);
    expect(timeFrameDays('End of study')).toBeNull();
  });
});

describe('renderClaim', () => {
  it('produces the fixed grammar', () => {
    const claim: Claim = {
      type: 'C1',
      endpoint: '3-point MACE',
      a: { kind: 'TRIAL_RESULT', label: 'NCT00000001', nctIds: ['NCT00000001'], effect: hr },
      b: { kind: 'TRIAL_RESULT', label: 'NCT00000002', nctIds: ['NCT00000002'], effect: { ...hr, value: 1.2, ciLow: 1.05, ciHigh: 1.37 } },
      conditions: [{ dimension: 'endpoint', statement: 'same endpoint node' }],
      discriminatingVariable: { basis: 'MEASURED', name: 'follow-up length', a: '2.1 years', b: '3.8 years' },
    };
    const sentence = renderClaim(claim);
    expect(sentence).toMatch(/ and .* cannot both hold for 3-point MACE under these conditions: same endpoint node\. The discriminating variable is follow-up length \(2\.1 years vs 3\.8 years\)\.$/);
  });
});
