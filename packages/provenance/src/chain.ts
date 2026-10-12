import { FACTOR_STAGES, type Factor, type FactorInput, type FactorStage, type FactorValue } from './factor.js';

/** Ordered, append-only list of factors. Sequence numbers are assigned on append. */
export class FactorChain {
  private readonly factors: Factor[] = [];

  static from(factors: readonly Factor[]): FactorChain {
    const chain = new FactorChain();
    chain.extend(factors);
    return chain;
  }

  add(input: FactorInput): this {
    this.factors.push({
      threshold: null,
      score: null,
      outcome: 'INFO',
      ...input,
      seq: this.factors.length + 1,
    });
    return this;
  }

  /** Appends factors produced elsewhere (another chain, or the engine) and renumbers them. */
  extend(factors: readonly Factor[]): this {
    for (const factor of factors) this.factors.push({ ...factor, seq: this.factors.length + 1 });
    return this;
  }

  get length(): number {
    return this.factors.length;
  }

  stage(stage: FactorStage): Factor[] {
    return this.factors.filter((f) => f.stage === stage);
  }

  failures(): Factor[] {
    return this.factors.filter((f) => f.outcome === 'FAIL');
  }

  toJSON(): Factor[] {
    return this.factors.map((f) => ({ ...f }));
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates JSON read back from the store. Throws on the first malformed factor. */
export function parseChain(value: unknown): Factor[] {
  if (!Array.isArray(value)) throw new TypeError('factor chain must be an array');
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new TypeError(`factor ${i} is not an object`);
    const { stage, name, rule, ruleVersion, inputs, outcome } = raw;
    if (typeof stage !== 'string' || !FACTOR_STAGES.includes(stage as FactorStage)) {
      throw new TypeError(`factor ${i} has unknown stage ${String(stage)}`);
    }
    if (typeof name !== 'string' || typeof rule !== 'string' || typeof ruleVersion !== 'string') {
      throw new TypeError(`factor ${i} is missing name, rule or ruleVersion`);
    }
    if (!isRecord(inputs)) throw new TypeError(`factor ${i} has no inputs`);
    if (outcome !== 'PASS' && outcome !== 'FAIL' && outcome !== 'INFO') {
      throw new TypeError(`factor ${i} has unknown outcome ${String(outcome)}`);
    }
    return { ...(raw as unknown as Factor), seq: i + 1 };
  });
}

export function formatValue(value: FactorValue): string {
  if (value === null) return 'n/a';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(4)).toString();
  }
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  return `{${Object.entries(value).map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')}}`;
}

/** One line per factor, in chain order. Used by the Markdown and PDF dossier exports. */
export function renderChain(factors: readonly Factor[]): string[] {
  return factors.map((f) => {
    const inputs = Object.entries(f.inputs).map(([k, v]) => `${k}=${formatValue(v)}`).join(', ');
    const threshold = f.threshold ? ` | threshold ${f.threshold.name} ${f.threshold.op} ${f.threshold.value}` : '';
    const score = f.score === null ? '' : ` | score ${f.score.toFixed(2)}`;
    return `${String(f.seq).padStart(2, '0')}. [${f.stage}] ${f.name} — ${f.rule}@${f.ruleVersion} | ${inputs}${threshold}${score} | ${f.outcome}: ${f.note}`;
  });
}
