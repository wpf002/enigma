import type { Agent } from './agents.js';
import { defineRule } from './registry.js';

export const DOSE_RULE = defineRule('DOSE', 'dose.parse_title', 'Dose read from the arm title next to the agent name, normalized to a daily amount in the agent reference unit.');

export interface Dose {
  /** Amount per day in `unit`. */
  daily: number;
  unit: Agent['unit'];
  /** The text the dose was read from, e.g. "10 mg once daily". */
  source: string;
}

const UNIT_TO: Record<string, { unit: Agent['unit']; factor: number }> = {
  mg: { unit: 'mg', factor: 1 },
  g: { unit: 'mg', factor: 1000 },
  mcg: { unit: 'mcg', factor: 1 },
  'µg': { unit: 'mcg', factor: 1 },
  'μg': { unit: 'mcg', factor: 1 },
  ug: { unit: 'mcg', factor: 1 },
  u: { unit: 'U', factor: 1 },
  iu: { unit: 'U', factor: 1 },
  unit: { unit: 'U', factor: 1 },
  units: { unit: 'U', factor: 1 },
};

const FREQUENCY: [RegExp, number, string][] = [
  [/\b(once[- ]weekly|once a week|weekly|qw|q\.w\.|ow|per week|\/ ?week)\b/, 1 / 7, 'once weekly'],
  [/\b(twice[- ]daily|twice a day|bid|b\.i\.d\.?|two times (a|per) day)\b/, 2, 'twice daily'],
  [/\b(three times (a|per) day|three times daily|thrice daily|tid|t\.i\.d\.?)\b/, 3, 'three times daily'],
  [/\b(once[- ]daily|once a day|daily|qd|q\.d\.|od|per day|\/ ?day)\b/, 1, 'once daily'],
];

function convert(amount: number, from: Agent['unit'], to: Agent['unit']): number | null {
  if (from === to) return amount;
  if (from === 'mcg' && to === 'mg') return amount / 1000;
  if (from === 'mg' && to === 'mcg') return amount * 1000;
  return null;
}

/**
 * Reads the dose of `agent` from arm text. Looks for the first amount after
 * the agent's name, then before it. Frequency comes from the title, then the
 * description. No frequency stated is treated as once daily, and says so.
 */
export function parseDose(agent: Agent, alias: string, title: string, description: string | null): Dose | null {
  const s = title.toLowerCase();
  const at = s.indexOf(alias);
  let perDose: number | null = null;
  let read = '';
  // "Alogliptin 25", "Lina5", "Sita 100": a bare number straight after the name is in the agent's own unit.
  const glued = at >= 0 ? s.slice(at + alias.length).match(/^\s*(\d+(?:\.\d+)?)(?!\s*(mg|mcg|µg|μg|ug|g|iu|units?|u|%|\.\d|\d|weeks?|days?|months?)\b)/) : null;
  const amount = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|μg|ug|g|iu|units?|u)\b(?!\s*\/\s*(kg|dl|ml|l)\b)/g;
  const matches = [...s.matchAll(amount)];
  if (matches.length > 0) {
    const after = matches.find((m) => m.index >= at);
    const pick = at >= 0 ? (after ?? matches[matches.length - 1]!) : matches[0]!;
    const unit = UNIT_TO[pick[2]!];
    if (unit) {
      perDose = convert(Number(pick[1]) * unit.factor, unit.unit, agent.unit);
      read = `${pick[1]} ${pick[2]}`;
    }
  }
  if (perDose === null && glued) {
    perDose = Number(glued[1]);
    read = `${glued[1]} ${agent.unit} (unit not stated)`;
  }
  if (perDose === null || !(perDose > 0)) return null;

  let perDay = 1;
  let label = 'frequency not stated, taken as once daily';
  for (const text of [s, (description ?? '').toLowerCase()]) {
    const found = FREQUENCY.find(([pattern]) => pattern.test(text));
    if (found) {
      perDay = found[1];
      label = found[2];
      break;
    }
  }
  return { daily: perDose * perDay, unit: agent.unit, source: `${read} ${label}` };
}
