// Versioned rule registry. Every harmonization decision names the rule that
// made it, and the rule set version is stamped on every derived record.
//
// Rules in this set were drafted with LLM assistance and have not been through
// clinician review. They are marked PENDING_HUMAN_REVIEW until someone signs
// them off (ENIGMA_ROADMAP.md §2.10, Phase 2 exit gate).

export const RULE_SET_VERSION = '0.1.0-draft';

export type RuleKind =
  | 'MEASURE' | 'ARM_ROLE' | 'DIRECTION' | 'ENDPOINT' | 'POPULATION' | 'INTERVENTION'
  | 'DOSE' | 'COMPARATOR' | 'TIMEPOINT' | 'ANALYSIS_POPULATION' | 'UNIT' | 'STOP_REASON';

export type ReviewStatus = 'PENDING_HUMAN_REVIEW' | 'REVIEWED';

export interface RuleMeta {
  id: string;
  kind: RuleKind;
  version: string;
  description: string;
  review: ReviewStatus;
}

const rules = new Map<string, RuleMeta>();

/** Registers a rule and returns its id, so call sites reference rules by constant. */
export function defineRule(kind: RuleKind, id: string, description: string, review: ReviewStatus = 'PENDING_HUMAN_REVIEW'): string {
  if (rules.has(id)) throw new Error(`duplicate rule id ${id}`);
  rules.set(id, { id, kind, version: RULE_SET_VERSION, description, review });
  return id;
}

export const ruleRegistry = {
  version: RULE_SET_VERSION,
  get: (id: string): RuleMeta | undefined => rules.get(id),
  list: (kind?: RuleKind): RuleMeta[] => [...rules.values()].filter((r) => !kind || r.kind === kind),
  reviewSummary: () => {
    const all = [...rules.values()];
    return { total: all.length, reviewed: all.filter((r) => r.review === 'REVIEWED').length };
  },
};
