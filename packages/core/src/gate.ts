/** The eight comparability dimensions (ENIGMA_ROADMAP.md §4), in evaluation order. */
export const GATE_DIMENSIONS = [
  'endpoint', 'measure', 'population', 'intervention', 'comparator', 'timepoint', 'analysisPopulation', 'direction',
] as const;
export type GateDimension = (typeof GATE_DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<GateDimension, string> = {
  endpoint: 'Endpoint',
  measure: 'Measure type',
  population: 'Population',
  intervention: 'Intervention',
  comparator: 'Comparator',
  timepoint: 'Timepoint',
  analysisPopulation: 'Analysis population',
  direction: 'Direction',
};

/** Why a dimension failed. Every failed edge carries one code per failed dimension. */
export const FAILURE_REASONS = {
  ENDPOINT_UNMAPPED: 'One or both outcomes are not mapped to an endpoint node.',
  ENDPOINT_ANCESTOR: 'One endpoint is a broader version of the other.',
  ENDPOINT_SIBLING: 'The endpoints share a parent but are different outcomes.',
  ENDPOINT_DIFFERENT: 'The endpoints are in the same family but are different outcomes.',
  MEASURE_CLASS_MISMATCH: 'The effect measures are of different classes and cannot be converted.',
  MEASURE_NOT_CONVERTIBLE: 'Conversion between the two measures needs data one record lacks.',
  POPULATION_LOW_OVERLAP: 'Encoded eligibility criteria overlap below threshold.',
  INTERVENTION_DIFFERENT_AGENT: 'Different agents of the same drug class.',
  INTERVENTION_DIFFERENT_CLASS: 'Different drug classes.',
  INTERVENTION_DOSE_OUTSIDE_BAND: 'Same agent, doses outside the equivalence band.',
  COMPARATOR_CLASS_MISMATCH: 'Different comparator classes.',
  COMPARATOR_DIFFERENT_ACTIVE: 'Both active-controlled, against different agents.',
  TIMEPOINT_NO_OVERLAP: 'Follow-up windows do not overlap.',
  TIMEPOINT_UNKNOWN: 'Follow-up length could not be read for one or both records.',
  ANALYSIS_POPULATION_MISMATCH: 'Different analysis populations (ITT vs per-protocol).',
  DIRECTION_UNRESOLVED: 'The sign convention of one or both records could not be established.',
} as const;
export type FailureReason = keyof typeof FAILURE_REASONS;
