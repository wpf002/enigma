import type { ArmProfile } from './arms.js';
import { defineRule } from './registry.js';

export const DIRECTION_HINT_RULE = defineRule('DIRECTION', 'direction.stated_order', 'estimate_description or groups_description states the order of the comparison ("A minus B", "A / B", "A vs B").');

export type DirectionHint = 'EXPERIMENTAL_FIRST' | 'COMPARATOR_FIRST';

const SEPARATOR = /\s+(?:minus|−|–|-|vs\.?|versus|over|divided by|relative to|compared (?:to|with)|\/)\s+|(?<=[a-z0-9)])\s*\/\s*(?=[a-z(])/;

function sideMatches(side: string, arm: ArmProfile, control: boolean): number {
  let score = 0;
  for (const hit of arm.hits) if (side.includes(hit.alias) || side.includes(hit.agent.label.toLowerCase())) score += 2;
  const title = arm.title.toLowerCase();
  if (title.length > 2 && side.includes(title)) score += 3;
  if (control && /\b(placebo|pbo|control|comparator|sham|reference|standard)\b/.test(side)) score += 2;
  if (!control && /\b(treatment|active|test|experimental|study drug|investigational)\b/.test(side)) score += 1;
  return score;
}

/** Reads the stated order of a comparison. Returns null unless both sides are identified without ambiguity. */
export function directionHint(texts: (string | null | undefined)[], experimental: ArmProfile, comparator: ArmProfile): DirectionHint | null {
  for (const raw of texts) {
    if (!raw) continue;
    for (const sentence of raw.toLowerCase().split(/[.;\n]/)) {
      const parts = sentence.split(SEPARATOR);
      if (parts.length !== 2) continue;
      const [left, right] = parts as [string, string];
      const le = sideMatches(left, experimental, false);
      const lc = sideMatches(left, comparator, true);
      const re = sideMatches(right, experimental, false);
      const rc = sideMatches(right, comparator, true);
      if (le > lc && rc > re) return 'EXPERIMENTAL_FIRST';
      if (lc > le && re > rc) return 'COMPARATOR_FIRST';
    }
  }
  return null;
}
