import { describe, expect, it } from 'vitest';
import { FactorChain, parseChain, renderChain } from './index.js';

const base = { stage: 'GATE', rule: 'endpoint.same_node', ruleVersion: '0.1.0', inputs: { a: 'mace-3p', b: 'mace-3p' }, output: 1, note: 'same node' } as const;

describe('FactorChain', () => {
  it('numbers factors in append order', () => {
    const chain = new FactorChain().add({ ...base, name: 'gate.endpoint' }).add({ ...base, name: 'gate.measure' });
    expect(chain.toJSON().map((f) => f.seq)).toEqual([1, 2]);
  });

  it('renumbers factors merged from another chain', () => {
    const engine = new FactorChain().add({ ...base, name: 'gate.endpoint' }).toJSON();
    const chain = new FactorChain().add({ ...base, stage: 'NORMALIZE', name: 'normalize.ci_to_se' }).extend(engine);
    expect(chain.toJSON().map((f) => [f.seq, f.name])).toEqual([[1, 'normalize.ci_to_se'], [2, 'gate.endpoint']]);
  });

  it('round-trips through JSON and rejects malformed factors', () => {
    const json = JSON.parse(JSON.stringify(new FactorChain().add({ ...base, name: 'gate.endpoint', outcome: 'PASS', score: 1 })));
    expect(parseChain(json)[0]?.outcome).toBe('PASS');
    expect(() => parseChain([{ ...base, stage: 'NOPE', name: 'x' }])).toThrow(/unknown stage/);
  });

  it('renders one line per factor with inputs and threshold', () => {
    const chain = new FactorChain().add({
      ...base,
      name: 'gate.endpoint',
      threshold: { name: 'gateThreshold', value: 0.7, op: '>=' },
      score: 1,
      outcome: 'PASS',
    });
    expect(renderChain(chain.toJSON())[0]).toContain('threshold gateThreshold >= 0.7');
  });
});
