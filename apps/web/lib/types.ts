import type { Claim, DiscriminatingVariable } from '@enigma/core';
import type { Factor } from '@enigma/provenance';

export interface Effect { measure: string; value: number; ciLow: number; ciHigh: number; ciLevel: number; text?: string }
export interface Party { label: string; nctIds: string[]; kind: string; effect: Effect; unit: string | null; effectText: string }

export interface ContradictionSummary {
  id: string;
  rank: number | null;
  type: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  typeLabel: string;
  endpoint: { id: string; label: string };
  agents: { id: string; label: string }[];
  nctIds: string[];
  sentence: string;
  brief: string;
  a: Party;
  b: Party;
  diagnosticValue: number;
  severity: number;
  gateConfidence: number;
  discriminatingVariable: DiscriminatingVariable;
  alreadyResolvedRef: string | null;
  clusterId: string | null;
  edgeId: string | null;
}

export type GateStatus = 'MET' | 'NOT_MET' | 'PARTIAL' | 'NOT_RUN';
export interface PhaseGate { phase: number; name: string; criterion: string; status: GateStatus; measured: string }

export interface Overview {
  snapshot: { id: string; aactVersion: string; source: string; area: string; fetchedAt: string; checksum: string; studyCount: number };
  counts: {
    trials: number; terminatedTrials: number; effectRecords: number; mappedRecords: number; candidatePairs: number; passedPairs: number;
    failedPairs: number; apparentConflicts: number; apparentConflictsDissolved: number; contradictions: number; clusters: number;
    unreadAlerts: number; byType: Record<string, number>;
  };
  failuresByDimension: { dimension: string; label: string; count: number }[];
  top: ContradictionSummary[];
  ruleSet: { version: string; rulesTotal: number; rulesReviewed: number };
  gates: PhaseGate[];
}

export interface TrialCard {
  nctId: string; title: string; acronym: string | null; status: string | null; phase: string | null; enrollment: number | null;
  sponsor: string | null; sponsorClass: string | null; completionDate: string | null; whyStopped: string | null; stopCategory: string | null;
}

export interface ClusterMember {
  recordId: string; nctId: string; label: string; completionDate: string | null; status: string | null; measure: string;
  value: number; ciLow: number | null; ciHigh: number | null; n: number | null; arm: string | null;
}

export interface Pooled { k: number; thetaFixed: number; thetaRandom: number; seRandom: number; ciLow: number; ciHigh: number; q: number; df: number; pQ: number; i2: number; tau2: number }
export interface CumulativePoint { index: number; label: string; date: string | null; k: number; theta: number; ciLow: number; ciHigh: number; z: number }
export interface ModeratorFit { name: string; k: number; slope: number; se: number; p: number; residualQ: number; residualI2: number; qExplained: number }
export interface ClusterStats { pooled: Pooled | null; cumulative: CumulativePoint[]; moderators: ModeratorFit[] }

export interface DossierBody {
  sentence: string;
  claim: Claim;
  type: string;
  typeLabel: string;
  endpoint: { id: string; label: string; path: { id: string; label: string }[] };
  snapshot: { id: string; aactVersion: string; source: string; fetchedAt: string; checksum: string };
  parties: {
    side: string; label: string; kind: string; effect: Effect; effectText: string; trials: TrialCard[];
    record: null | {
      id: string; outcomeTitle: string; classification: string | null; outcomeType: string | null; timeFrame: string | null; timepointDays: number | null;
      units: string | null; sourceKind: string; experimentalLabel: string | null; comparatorLabel: string | null; doseDaily: number | null;
      doseUnit: string | null; analysisPopulation: string | null; nAnalyzed: number | null;
    };
  }[];
  comparabilityProof: {
    gateScore: number; threshold: number; weakestDimension: string | null;
    dimensions: { dimension: string; label: string; score: number | null; statement: string | null; rule: string | null; note: string | null }[];
  };
  discriminatingVariable: DiscriminatingVariable;
  diagnosticValue: { value: number; components: { key: string; label: string; weight: number; value: number; contribution: number }[]; zDiff: number | null; pDiff: number | null; qDiff: number | null };
  severity: number;
  clusterContext: null | { id: string; label: string; k: number; nPatients: number; density: number; minGateScore: number; measure: string; stats: ClusterStats; members: ClusterMember[] };
  alreadyResolved: null | { id: string; citation: string; pmid: string | null; conclusion: string; coverage: number; reviewStatus: string };
  ruleSet: { version: string; harmonization: string; rulesTotal: number; rulesReviewed: number };
  grammarNote: string;
}

export interface ContradictionDetail extends ContradictionSummary {
  components: Record<string, number | null>;
  factors: Factor[];
  dossier: { id: string; title: string; body: DossierBody; createdAt: string } | null;
  prevId: string | null;
  nextId: string | null;
}

export interface ContradictionList { total: number; page: number; pageSize: number; facets: { type: Record<string, number> }; items: ContradictionSummary[] }

export interface MapNode {
  id: string; label: string; title: string; status: string | null; stopCategory: string | null; completionDate: string | null; enrollment: number | null;
  effect: (Effect & { arm: string | null; n: number | null }) | null;
}
export interface MapLink { source: string; target: string; gateScore: number; edges: number; contradiction: { id: string; type: string; rank: number | null } | null }
export interface MapCluster {
  id: string; label: string; endpoint: { id: string; label: string }; agents: { id: string; label: string }[]; comparatorClass: string | null; measure: string;
  k: number; nPatients: number; density: number; minGateScore: number; i2: number | null; contradictionCount: number;
  clusterFindings: { id: string; type: string; rank: number | null }[]; nodes: MapNode[]; links: MapLink[];
}
export interface MapResponse { endpoints: { id: string; label: string; clusters: number; contradictions: number }[]; totalClusters: number; clusters: MapCluster[] }

export interface EndpointRow {
  id: string; parentId: string | null; label: string; family: string; depth: number; lowerIsBetter: boolean | null; abstract: boolean;
  meshTerms: string[]; records: number; trials: number; clusters: number; contradictions: number;
}

export interface TimelinePoint {
  recordId: string; nctId: string; label: string; title: string; arm: string | null; comparator: string | null; comparatorClass: string | null;
  date: string | null; status: string; stopCategory: string | null; effect: Effect & { text: string }; units: string | null; n: number | null;
  timepointDays: number | null; sourceKind: string; doseDaily: number | null; doseUnit: string | null;
}
export interface TimelineResponse {
  endpoint: { id: string; label: string; family: string; lowerIsBetter: boolean | null; path: { id: string; label: string }[] };
  agents: { id: string; label: string; records: number }[];
  agent: string | null;
  measures: { id: string; records: number }[];
  measure: string | null;
  points: TimelinePoint[];
  clusters: { id: string; label: string; k: number; nPatients: number; comparatorClass: string | null; nctIds: string[]; stats: ClusterStats }[];
  contradictions: ContradictionSummary[];
}

export interface RecordCard {
  id: string; nctId: string; label: string; outcomeTitle: string; classification: string | null; endpoint: { id: string | null; label: string };
  effect: Effect & { text: string }; units: string | null; arm: string | null; comparator: string | null; agents: string[]; doseDaily: number | null;
  doseUnit: string | null; comparatorClass: string | null; timepointDays: number | null; analysisPopulation: string | null; n: number | null; sourceKind: string;
}
export interface FailureItem {
  id: string; gateScore: number; weakestDimension: string; weakestLabel: string; dimensionScores: Record<string, number>; apparentConflict: boolean;
  failureReasons: { dimension: string; label: string; reason: string; text: string }[]; a: RecordCard | null; b: RecordCard | null;
}
export interface FailureList {
  total: number; page: number; pageSize: number;
  summary: {
    failed: number; apparentDissolved: number;
    byDimension: { dimension: string; label: string; failed: number; apparentDissolved: number }[];
    groups: { blockKey: string; endpoint: { id: string; label: string }; intervention: string; dimension: string; dimensionLabel: string; pairs: number }[];
  };
  items: FailureItem[];
}

export interface TrialDetail {
  nctId: string; title: string; acronym: string | null; status: string; phase: string | null; enrollment: number | null; startDate: string | null;
  completionDate: string | null; resultsPostedDate: string | null; sponsor: string | null; sponsorClass: string | null; allocation: string | null;
  masking: string | null; whyStopped: string | null; stopCategory: string | null; registryUrl: string;
  population: Record<string, any>;
  arms: { title: string; type: string | null; agents: string[]; placebo: boolean }[];
  records: {
    id: string; endpoint: { id: string | null; label: string }; outcomeTitle: string; classification: string | null; effect: Effect & { text: string };
    units: string | null; arm: string | null; comparator: string | null; agents: string[]; comparatorClass: string | null; timepointDays: number | null;
    analysisPopulation: string | null; n: number | null; sourceKind: string; directionResolved: boolean; doseDaily: number | null; doseUnit: string | null;
  }[];
  unmappedRecords: number;
  gate: { passed: number; failedByDimension: Record<string, number> };
  contradictions: ContradictionSummary[];
}

export interface SearchResponse {
  trials: { nctId: string; acronym: string | null; title: string; status: string }[];
  endpoints: { id: string; label: string; family: string }[];
  agents: { id: string; label: string; class: string }[];
  contradictions: ContradictionSummary[];
}

export interface Watchlist { id: string; name: string; kind: 'ENDPOINT' | 'AGENT' | 'TRIAL'; value: string; label: string; createdAt: string; unread: number }
export interface Alert {
  id: string; kind: string; title: string; detail: Record<string, any>; readAt: string | null; createdAt: string; snapshot: string;
  watchlist: { id: string; name: string; kind: string; value: string };
}

export interface PipelineResponse {
  gates: PhaseGate[];
  runs: { step: string; ruleVersion: string | null; startedAt: string; finishedAt: string | null; stats: Record<string, any> }[];
}
export interface RulesResponse { version: string; review: { total: number; reviewed: number }; rules: { id: string; kind: string; version: string; description: string; review: string }[] }
