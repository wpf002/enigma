import { describe, expect, it } from 'vitest';
import {
  classifyAnalysisPopulation, classifyEndpoint, encodePopulation, endpointPath, inclusionText, resolveUnit, ruleRegistry,
} from './index.js';

const ep = (title: string, measure: 'MD' | 'HR' | 'RR' | 'OR' = 'MD', units: string | null = null, classification: string | null = null) =>
  classifyEndpoint({ title, classification, measure, units });

describe('classifyEndpoint', () => {
  it('maps HbA1c spellings to one node', () => {
    for (const title of ['Change in HbA1c', 'Change From Baseline in Glycosylated Haemoglobin (Week 12).', 'Hemoglobin A1c', 'Adjusted mean change in HbA1c levels']) {
      expect(ep(title, 'MD', '%').nodeId).toBe('hba1c-change');
    }
  });
  it('separates HbA1c target thresholds and keeps them apart from the continuous node', () => {
    expect(ep('Percentage of Patients With HbA1c Level Less Than 7% at Week 24', 'RR').nodeId).toBe('hba1c-lt7');
    expect(ep('Percentage of patients with glycosylated hemoglobin (HbA1c) level less than or equal to 6.5%', 'OR').nodeId).toBe('hba1c-le65');
    expect(ep('Participants achieving HbA1c < 8%', 'RR').nodeId).toBe('hba1c-target');
  });
  it('assigns cardiovascular composites from their components', () => {
    expect(ep('Time to first occurrence of CV death, non-fatal MI (excluding silent MI), and non-fatal stroke', 'HR').nodeId).toBe('mace-3p');
    expect(ep('Composite of CV death, non-fatal MI, non-fatal stroke and hospitalisation for unstable angina', 'HR').nodeId).toBe('mace-4p');
    expect(ep('Time to all-cause death, non-fatal myocardial infarction or non-fatal stroke', 'HR').nodeId).toBe('mace-acm');
    expect(ep('Time to cardiovascular death', 'HR').nodeId).toBe('death-cv');
    expect(ep('All-cause mortality', 'HR').nodeId).toBe('death-all-cause');
    expect(ep('CV death or hospitalization for heart failure', 'HR').nodeId).toBe('hhf-cv-death');
    expect(ep('Time to first non-fatal myocardial infarction', 'HR').nodeId).toBe('mi-nonfatal');
  });
  it('puts all-cause and cardiovascular mortality under one parent as siblings', () => {
    expect(endpointPath('death-cv').slice(0, -1)).toEqual(endpointPath('death-all-cause').slice(0, -1));
  });
  it('splits body weight by unit', () => {
    expect(ep('Change in body weight', 'MD', 'kg').nodeId).toBe('weight-change');
    expect(ep('Change in body weight (%)', 'MD', 'percent change').nodeId).toBe('weight-change-pct');
    expect(ep('Percentage of patients with at least 5% weight loss from baseline', 'RR').nodeId).toBe('weight-loss-5pct');
  });
  it('uses the classification when it names the endpoint or the visit', () => {
    expect(ep('Change in Fasting Blood Lipids', 'MD', 'mg/dL', 'Total cholesterol').nodeId).toBe('tc-change');
    const visit = ep('Change from baseline in HbA1c', 'MD', '%', 'Week 24');
    expect(visit).toMatchObject({ nodeId: 'hba1c-change', classificationRole: 'VISIT', classificationDays: 168 });
  });
  it('rejects baseline rows, subgroup rows and ambiguous titles', () => {
    expect(ep('HbA1c', 'MD', '%', 'Baseline').reason).toBe('CLASSIFICATION_BASELINE');
    expect(ep('Change in HbA1c', 'MD', '%', 'Age < 65 years').reason).toBe('CLASSIFICATION_UNRECOGNIZED');
    expect(ep('Change in blood pressure (systolic and diastolic blood pressure)', 'MD', 'mmHg').reason).toBe('UNMAPPED');
    expect(ep('Change in pulse rate', 'MD', 'bpm').reason).toBe('UNMAPPED');
  });
});

describe('resolveUnit', () => {
  it('rescales to the canonical unit and keeps unrecognized units as their own key', () => {
    expect(resolveUnit('glucose', 'mg/dL')).toMatchObject({ unit: 'mmol/L', recognized: true });
    expect(resolveUnit('glucose', 'mg/dL').factor).toBeCloseTo(1 / 18.016);
    expect(resolveUnit('hba1c', 'percentage of glycosylated haemoglobin')).toMatchObject({ unit: '%', factor: 1 });
    expect(resolveUnit('weight', 'score on a scale')).toMatchObject({ unit: 'score on a scale', recognized: false, factor: 1 });
  });
});

describe('classifyAnalysisPopulation', () => {
  it('reads the analysis set', () => {
    expect(classifyAnalysisPopulation('Full analysis set (FAS)').population).toBe('MITT');
    expect(classifyAnalysisPopulation('Intent-to-treat population: all randomized participants').population).toBe('ITT');
    expect(classifyAnalysisPopulation('Per protocol set').population).toBe('PP');
    expect(classifyAnalysisPopulation('TS').population).toBe('AS_TREATED');
    expect(classifyAnalysisPopulation(null).population).toBe('UNKNOWN');
  });
});

describe('encodePopulation', () => {
  const criteria = `Inclusion Criteria:
* Diagnosis of type 2 diabetes
* HbA1c between 7.0% and 10.5% at screening
* BMI ≤ 45 kg/m2
* On a stable dose of metformin ≥ 1500 mg/day for at least 8 weeks
* History of myocardial infarction or stroke
Exclusion Criteria:
* Treated with insulin in the past 3 months
* eGFR < 30`;
  it('reads ranges and background therapy from the inclusion section only', () => {
    expect(inclusionText(criteria)).not.toContain('egfr');
    const p = encodePopulation({ minimum_age: '18 Years', maximum_age: '80 Years', gender: 'ALL', criteria }, [
      { title: 'Age, Continuous', param_type: 'MEAN', units: 'years', ctgov_group_code: 'BG000', param_value_num: 60 },
      { title: 'Age, Continuous', param_type: 'MEAN', units: 'years', ctgov_group_code: 'BG001', param_value_num: 62 },
      { title: 'Sex: Female, Male', category: 'Female', ctgov_group_code: 'BG000', param_value_num: 40 },
      { title: 'Sex: Female, Male', category: 'Male', ctgov_group_code: 'BG000', param_value_num: 60 },
    ]);
    expect(p).toMatchObject({
      ageMin: 18, ageMax: 80, hba1cMin: 7, hba1cMax: 10.5, bmiMin: null, bmiMax: 45,
      background: 'METFORMIN', cvRisk: 'ESTABLISHED_OR_HIGH', renal: 'GENERAL',
    });
    expect(p.baseline).toMatchObject({ ageMean: 61, femalePct: 40 });
  });
  it('recognizes treatment-naive and insulin-treated populations', () => {
    expect(encodePopulation({ criteria: 'Inclusion: drug-naive patients managed with diet and exercise alone' }, []).background).toBe('NAIVE');
    expect(encodePopulation({ criteria: 'Inclusion: treated with basal insulin for at least 6 months' }, []).background).toBe('INSULIN');
  });
});

describe('ruleRegistry', () => {
  it('versions every rule and reports none as clinician-reviewed yet', () => {
    const summary = ruleRegistry.reviewSummary();
    expect(summary.total).toBeGreaterThan(30);
    expect(summary.reviewed).toBe(0);
    expect(ruleRegistry.list('ENDPOINT').every((r) => r.version === ruleRegistry.version)).toBe(true);
  });
});
