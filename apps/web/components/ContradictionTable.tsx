import Link from 'next/link';
import { score, splitLabel, titleCase } from '@/lib/format';
import type { ContradictionSummary, Party } from '@/lib/types';
import { ForestMarks } from './Forest';
import { Meter, TypeBadge } from './ui';

const GRID = 'lg:grid-cols-[32px_minmax(0,3fr)_minmax(0,4fr)_minmax(0,2fr)_88px_minmax(0,3fr)_72px]';

function PartyLine({ p }: { p: Party }) {
  const [trial, arm] = splitLabel(p.label);
  return (
    <p className="flex h-6 items-center gap-2 truncate text-sm">
      <span className="shrink-0 font-mono">{trial}</span>
      <span className="truncate text-muted">{arm.replace(/ vs .*$/, '')}</span>
    </p>
  );
}

/** Ranked contradictions. One row each: the two results on a shared axis, the named variable, the value. */
export function ContradictionTable({ items }: { items: ContradictionSummary[] }) {
  return (
    <div className="card overflow-hidden">
      <div className={`hidden border-b border-border bg-sunken px-4 py-2 lg:grid lg:gap-4 ${GRID}`}>
        {['#', 'Endpoint', 'Results', '', 'Effect', 'Variable', 'Value'].map((h, i) => (
          <span key={`${h}-${i}`} className={`eyebrow ${h === 'Effect' || h === 'Value' ? 'text-right' : ''}`}>{h}</span>
        ))}
      </div>
      {items.map((c) => {
        const d = c.discriminatingVariable;
        const digits = Math.abs(c.a.effect.value) < 10 && Math.abs(c.b.effect.value) < 10 ? 2 : 1;
        return (
          <Link key={c.id} href={`/contradictions/${c.id}`} className={`row-link grid gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 lg:items-center ${GRID}`}>
            <span className="num hidden font-mono text-sm text-muted lg:block">{c.rank}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2"><TypeBadge type={c.type} /><span className="truncate text-sm font-medium">{c.endpoint.label}</span></span>
              <span className="mt-1 block truncate text-xs text-muted">{c.agents.map((a) => a.label).join(' + ')}{c.alreadyResolvedRef ? ' · Reviewed' : ''}</span>
            </span>
            <span className="min-w-0"><PartyLine p={c.a} /><PartyLine p={c.b} /></span>
            <ForestMarks
              measure={c.a.effect.measure}
              rows={[
                { key: 'a', label: 'A', value: c.a.effect.value, ciLow: c.a.effect.ciLow, ciHigh: c.a.effect.ciHigh, kind: 'accent' },
                { key: 'b', label: 'B', value: c.b.effect.value, ciLow: c.b.effect.ciLow, ciHigh: c.b.effect.ciHigh, kind: 'accent' },
              ]}
            />
            <span className="num hidden text-right font-mono text-sm lg:block">
              <span className="flex h-6 items-center justify-end">{c.a.effect.value.toFixed(digits)}</span>
              <span className="flex h-6 items-center justify-end">{c.b.effect.value.toFixed(digits)}</span>
            </span>
            <span className="min-w-0 text-sm">
              {d.basis === 'MEASURED' ? (
                <>
                  <span className="block truncate">{titleCase(d.name.replace(/,.*$/, ''))}</span>
                  {(d.a || d.b) && <span className="num block truncate text-xs text-muted">{d.a ?? 'n/a'} / {d.b ?? 'n/a'}</span>}
                </>
              ) : <span className="text-muted">Unidentified</span>}
            </span>
            <span>
              <span className="num mb-1 block text-right font-mono text-sm font-medium">{score(c.diagnosticValue)}</span>
              <Meter value={c.diagnosticValue} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
