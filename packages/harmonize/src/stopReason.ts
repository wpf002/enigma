import { defineRule } from './registry.js';

export type StopCategory = 'FUTILITY' | 'SAFETY' | 'ENROLLMENT' | 'BUSINESS' | 'OTHER';

const RULES: [StopCategory, RegExp, string][] = [
  ['FUTILITY', /futil|lack of efficacy|no (significant )?(benefit|efficacy|effect)|insufficient efficacy|did not (meet|show)|ineffective|unlikely to (demonstrate|show|meet)/, defineRule('STOP_REASON', 'stop.futility', 'why_stopped names futility or lack of efficacy.')],
  ['SAFETY', /safety|adverse|toxicit|risk[- ]benefit|benefit[- ]risk|harm|liver|hepat|cardiovascular (risk|safety)|\bdsmb\b|data (and )?safety monitoring/, defineRule('STOP_REASON', 'stop.safety', 'why_stopped names a safety finding or a DSMB recommendation.')],
  ['ENROLLMENT', /enrol|recruit|accrual|low (inclusion|participation)|insufficient (number|participants|patients)/, defineRule('STOP_REASON', 'stop.enrollment', 'why_stopped names slow or failed enrollment.')],
  ['BUSINESS', /sponsor|business|strategic|commercial|funding|financial|company decision|portfolio|discontinu(ed|ation) of (development|the (program|compound))|administrative|covid/, defineRule('STOP_REASON', 'stop.business', 'why_stopped names a sponsor, funding or administrative decision.')],
];
const OTHER_RULE = defineRule('STOP_REASON', 'stop.other', 'Terminated with a reason that matches no category, or with none given.');

/** Terminated trials are first-class (ENIGMA_ROADMAP.md §2.7). The stop reason is kept as signal. */
export function classifyStopReason(status: string, whyStopped: string | null): { category: StopCategory; rule: string } | null {
  if (status.toUpperCase() !== 'TERMINATED') return null;
  const s = (whyStopped ?? '').toLowerCase();
  for (const [category, pattern, rule] of RULES) if (pattern.test(s)) return { category, rule };
  return { category: 'OTHER', rule: OTHER_RULE };
}
