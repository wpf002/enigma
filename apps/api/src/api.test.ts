import { describe, expect, it } from 'vitest';
import { renderDossierPdf } from './pdf.js';

const body = {
  type: 'C1',
  sentence: 'A and B cannot both hold for 3-point MACE under these conditions: same endpoint. The discriminating variable is dose (10 mg/day vs 25 mg/day).',
  diagnosticValue: { value: 0.71, zDiff: -3.2, pDiff: 0.0014, qDiff: 0.02, components: [{ label: 'Severity', value: 0.8, weight: 0.25, contribution: 0.2 }] },
  severity: 0.8,
  comparabilityProof: { gateScore: 0.75, threshold: 0.7, weakestDimension: 'population', dimensions: [{ label: 'Endpoint', score: 1, statement: 'same endpoint', rule: 'endpoint.same_node' }] },
  snapshot: { aactVersion: 'test', source: 'CTGOV_API_SUBSET', checksum: 'abc123' },
  ruleSet: { version: '0.1.0-draft', rulesReviewed: 0, rulesTotal: 45 },
  parties: [
    { side: 'A', label: 'Trial A', effectText: 'HR 0.80 (95% CI 0.70 to 0.91)', trials: [{ nctId: 'NCT1', title: 'Trial A', status: 'COMPLETED' }], record: null },
    { side: 'B', label: 'Trial B', effectText: 'HR 1.25 (95% CI 1.05 to 1.49)', trials: [{ nctId: 'NCT2', title: 'Trial B', status: 'TERMINATED', stopCategory: 'FUTILITY', whyStopped: 'Futility' }], record: null },
  ],
  discriminatingVariable: { basis: 'MEASURED', name: 'dose', a: '10 mg/day', b: '25 mg/day' },
  clusterContext: null,
  alreadyResolved: null,
  grammarNote: 'Enigma states that two results cannot both hold under the stated conditions.',
};

describe('renderDossierPdf', () => {
  it('produces a PDF document', async () => {
    const pdf = await renderDossierPdf({ rank: 1, title: 'Direction conflict: 3-point MACE', body }, [
      { seq: 1, stage: 'GATE', name: 'gate.endpoint', rule: 'endpoint.same_node', ruleVersion: 'engine-0.1.0', inputs: { a: 'mace-3p', b: 'mace-3p' }, threshold: null, output: 1, score: 1, outcome: 'PASS', note: 'Same endpoint node.' },
    ]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
