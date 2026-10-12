import { formatEffect, type EffectSize } from './effect.js';
import type { GateDimension } from './gate.js';

// Output grammar (ENIGMA_ROADMAP.md §2.6):
//
//   A and B cannot both hold under conditions C. The discriminating variable is D.
//
// A Claim has no field for a verdict, a recommendation or free prose, and
// ClaimSentence can only be produced by renderClaim. There is no way to make
// the system say that a result is wrong.

export const CONTRADICTION_TYPES = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;
export type ContradictionType = (typeof CONTRADICTION_TYPES)[number];

export const CONTRADICTION_LABEL: Record<ContradictionType, string> = {
  C1: 'Direction conflict',
  C2: 'Magnitude incompatibility',
  C3: 'Null / effect conflict',
  C4: 'Heterogeneity anomaly',
  C5: 'Temporal reversal',
};

/** One side of a claim: a single trial result, or a pooled result over named trials. */
export interface ClaimParty {
  readonly kind: 'TRIAL_RESULT' | 'POOLED_RESULT';
  readonly label: string;
  readonly nctIds: readonly string[];
  readonly effect: Pick<EffectSize, 'measure' | 'value' | 'ciLow' | 'ciHigh' | 'ciLevel'>;
  /** Unit of a mean difference. Null for ratios and standardized differences. */
  readonly unit?: string | null;
}

/** A condition under which the two results were judged comparable. One per gate dimension. */
export interface ClaimCondition {
  readonly dimension: GateDimension;
  readonly statement: string;
}

export interface DiscriminatingVariable {
  /** MEASURED: a recorded covariate differs between A and B. UNIDENTIFIED: none does. */
  readonly basis: 'MEASURED' | 'UNIDENTIFIED';
  readonly name: string;
  readonly a: string | null;
  readonly b: string | null;
}

export interface Claim {
  readonly type: ContradictionType;
  readonly endpoint: string;
  readonly a: ClaimParty;
  readonly b: ClaimParty;
  readonly conditions: readonly ClaimCondition[];
  readonly discriminatingVariable: DiscriminatingVariable;
}

declare const claimSentence: unique symbol;
export type ClaimSentence = string & { readonly [claimSentence]: true };

const party = (p: ClaimParty): string => `${p.label} (${formatEffect(p.effect, p.unit)})`;

export function renderDiscriminator(d: DiscriminatingVariable): string {
  if (d.basis === 'UNIDENTIFIED') return 'unidentified: no recorded covariate differs between the two';
  return `${d.name} (${d.a ?? 'not recorded'} vs ${d.b ?? 'not recorded'})`;
}

export function renderClaim(claim: Claim): ClaimSentence {
  const conditions = claim.conditions.map((c) => c.statement).join('; ');
  return (`${party(claim.a)} and ${party(claim.b)} cannot both hold for ${claim.endpoint} under these conditions: ` +
    `${conditions}. The discriminating variable is ${renderDiscriminator(claim.discriminatingVariable)}.`) as ClaimSentence;
}
