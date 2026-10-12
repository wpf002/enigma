import { createHash } from 'node:crypto';

/** JSON with object keys sorted, so equal values always produce equal strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashOf(value: unknown): string {
  return sha256(stableStringify(value));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function createLogger(scope: string) {
  const line = (level: string, msg: string, data?: Record<string, unknown>) => {
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`${new Date().toISOString()} ${level} [${scope}] ${msg}${suffix}`);
  };
  return {
    info: (msg: string, data?: Record<string, unknown>) => line('INFO', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => line('WARN', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => line('ERROR', msg, data),
  };
}
