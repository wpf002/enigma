/** Pipeline stage that produced a factor. Chains are ordered by stage, then by sequence. */
export const FACTOR_STAGES = ['NORMALIZE', 'HARMONIZE', 'GATE', 'CONTRADICTION', 'RANK'] as const;
export type FactorStage = (typeof FACTOR_STAGES)[number];

export type FactorValue = string | number | boolean | null | FactorValue[] | { [key: string]: FactorValue };

export type FactorOutcome = 'PASS' | 'FAIL' | 'INFO';

export interface FactorThreshold {
  name: string;
  value: number;
  op: '>=' | '<=' | '>' | '<' | '==';
}

/**
 * One step of a provenance chain: the rule that fired, the values it read,
 * the threshold it applied and what it produced. The engine emits the same
 * shape (apps/engine/enigma_engine/provenance.py).
 */
export interface Factor {
  seq: number;
  stage: FactorStage;
  /** Dotted name of what was evaluated, e.g. "gate.endpoint" or "normalize.ci_to_se". */
  name: string;
  /** Rule id, e.g. "endpoint.same_node". */
  rule: string;
  ruleVersion: string;
  inputs: Record<string, FactorValue>;
  threshold: FactorThreshold | null;
  /** Value produced by the step. Scores are in [0, 1]. */
  output: FactorValue;
  score: number | null;
  outcome: FactorOutcome;
  note: string;
}

export type FactorInput = Omit<Factor, 'seq' | 'threshold' | 'score' | 'outcome'> &
  Partial<Pick<Factor, 'threshold' | 'score' | 'outcome'>>;
