import { defineRule } from './registry.js';

export type AnalysisPopulation = 'ITT' | 'MITT' | 'PP' | 'AS_TREATED' | 'UNKNOWN';

const RULES: [AnalysisPopulation, RegExp, string][] = [
  ['PP', /per[- ]protocol|\bpp\b|\bpps\b|completers?\b|evaluable (population|patients|participants)/, defineRule('ANALYSIS_POPULATION', 'analysis_population.per_protocol', 'Outcome population text names a per-protocol or completer set.')],
  ['MITT', /modified intent|modified intention|\bmitt\b|\bm-itt\b|full analysis set|\bfas\b/, defineRule('ANALYSIS_POPULATION', 'analysis_population.modified_itt', 'Outcome population text names a modified ITT or full analysis set.')],
  ['ITT', /intent[- ]to[- ]treat|intention[- ]to[- ]treat|\bitt\b|all randomi[sz]ed|randomi[sz]ed (set|population|participants|subjects|patients)/, defineRule('ANALYSIS_POPULATION', 'analysis_population.itt', 'Outcome population text names the ITT or all-randomized set.')],
  ['AS_TREATED', /safety (population|analysis set|set|analysis population)|as[- ]treated|treated set|all treated|\bts\b|received at least one dose/, defineRule('ANALYSIS_POPULATION', 'analysis_population.as_treated', 'Outcome population text names a safety or as-treated set.')],
];
const UNKNOWN_RULE = defineRule('ANALYSIS_POPULATION', 'analysis_population.unknown', 'Outcome population text is missing or names no recognized analysis set.');

export function classifyAnalysisPopulation(text: string | null | undefined): { population: AnalysisPopulation; rule: string } {
  const s = (text ?? '').toLowerCase();
  for (const [population, pattern, rule] of RULES) if (pattern.test(s)) return { population, rule };
  return { population: 'UNKNOWN', rule: UNKNOWN_RULE };
}
