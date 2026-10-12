import Link from 'next/link';
import { score } from '@/lib/format';
import type { ContradictionSummary } from '@/lib/types';
import { Forest } from './Forest';
import { Meter, TypeBadge } from './ui';

/** One contradiction as a list row: the two results on a shared axis, the named variable, the rank. */
export function ContradictionRow({ c }: { c: ContradictionSummary }) {
  const d = c.discriminatingVariable;
  return (
    <Link href={`/contradictions/${c.id}`} className="row-link grid gap-4 border-b border-border px-4 py-4 md:grid-cols-[32px_minmax(0,7fr)_minmax(0,3fr)_112px] md:items-center">
      <div className="num font-mono text-sm text-muted">{c.rank ?? ''}</div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <TypeBadge type={c.type} label={c.typeLabel} />
          <span className="text-sm font-medium">{c.endpoint.label}</span>
          {c.alreadyResolvedRef && <span className="chip">covered by a review</span>}
        </div>
        <Forest
          compact
          measure={c.a.effect.measure}
          rows={[
            { key: 'a', label: c.a.label, value: c.a.effect.value, ciLow: c.a.effect.ciLow, ciHigh: c.a.effect.ciHigh, kind: 'accent' },
            { key: 'b', label: c.b.label, value: c.b.effect.value, ciLow: c.b.effect.ciLow, ciHigh: c.b.effect.ciHigh, kind: 'accent' },
          ]}
        />
      </div>
      <div className="min-w-0 text-sm">
        <p className="eyebrow mb-1">Discriminating variable</p>
        {d.basis === 'MEASURED' ? (
          <p className="truncate">
            <span className="font-medium">{d.name}</span>
            <span className="text-muted">{d.a || d.b ? ` · ${d.a ?? 'n/a'} vs ${d.b ?? 'n/a'}` : ''}</span>
          </p>
        ) : (
          <p className="text-muted">Unidentified</p>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="eyebrow">Value</span>
          <span className="num text-sm font-bold">{score(c.diagnosticValue)}</span>
        </div>
        <Meter value={c.diagnosticValue} />
      </div>
    </Link>
  );
}
