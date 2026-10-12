'use client';

import { useMemo, useState } from 'react';
import type { Factor, FactorValue } from '@enigma/provenance';
import { IconCheck, IconChevron, IconX } from './icons';

const STAGE_LABEL: Record<string, string> = {
  NORMALIZE: 'Normalize', HARMONIZE: 'Harmonize', GATE: 'Gate', CONTRADICTION: 'Test', RANK: 'Rank',
};

function show(value: FactorValue | undefined): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : Number(value.toPrecision(5)).toString();
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(5)) : v), 1).replace(/\n\s*/g, ' ');
}

/** The Factor chain behind a contradiction, in order. Each step opens to its inputs, threshold and output. */
export function Provenance({ factors }: { factors: Factor[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const groups = useMemo(() => {
    const out: { key: string; label: string; factors: Factor[] }[] = [];
    for (const f of factors) {
      const label = `${STAGE_LABEL[f.stage] ?? f.stage}${f.subject ? ` · ${f.subject}` : ''}`;
      const last = out[out.length - 1];
      if (last && last.label === label) last.factors.push(f);
      else out.push({ key: `${label}-${f.seq}`, label, factors: [f] });
    }
    return out;
  }, [factors]);
  const all = open.size === factors.length;
  const toggle = (seq: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" className="btn" onClick={() => setOpen(all ? new Set() : new Set(factors.map((f) => f.seq)))}>
          {all ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="eyebrow mb-2">{g.label}</p>
            <ol className="card overflow-hidden">
              {g.factors.map((f) => {
                const isOpen = open.has(f.seq);
                return (
                  <li key={f.seq} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => toggle(f.seq)} aria-expanded={isOpen} className="row-link grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-left">
                      <span className="num font-mono text-xs text-muted">{String(f.seq).padStart(2, '0')}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{f.note}</span>
                        <span className="block truncate font-mono text-xs text-muted">{f.rule}@{f.ruleVersion}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        {f.score !== null && <span className="num font-mono text-sm">{f.score.toFixed(2)}</span>}
                        {f.outcome === 'PASS' && <IconCheck className="text-good" aria-label="pass" />}
                        {f.outcome === 'FAIL' && <IconX className="text-critical" aria-label="flag" />}
                        <IconChevron className={`text-muted transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <dl className="grid gap-x-6 gap-y-2 bg-sunken px-4 py-3 pl-12 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
                        <dt className="text-muted">Step</dt>
                        <dd className="font-mono text-xs">{f.name}</dd>
                        {Object.entries(f.inputs).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-muted">{k}</dt>
                            <dd className="break-words font-mono text-xs">{show(v)}</dd>
                          </div>
                        ))}
                        {f.threshold && (
                          <>
                            <dt className="text-muted">Threshold</dt>
                            <dd className="font-mono text-xs">{f.threshold.name} {f.threshold.op} {f.threshold.value}</dd>
                          </>
                        )}
                        <dt className="text-muted">Output</dt>
                        <dd className="break-words font-mono text-xs">{show(f.output)}</dd>
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
