import Link from 'next/link';
import { isRatio, score, splitLabel } from '@/lib/format';
import { typeName, unitSuffix, variableName, variableValues } from '@/lib/labels';
import type { ContradictionSummary, Party } from '@/lib/types';
import { ForestMarks } from './Forest';
import { Meter } from './ui';

const GRID = 'lg:grid-cols-[32px_minmax(0,3fr)_minmax(0,5fr)_minmax(0,2fr)_128px_minmax(0,2fr)_72px]';

/** "SURPASS-4 (NCT03730662)" -> the trial's name. A trial without one is shown by its registry id. */
function PartyLine({ p }: { p: Party }) {
  const [trial, arm] = splitLabel(p.label);
  const named = trial.match(/^(.+) \((NCT\d+)\)$/);
  return (
    <p className="grid h-6 grid-cols-[112px_minmax(0,1fr)] items-center gap-2 text-sm" title={p.label}>
      <span className={`truncate ${named ? 'font-medium' : 'font-mono'}`}>{named ? named[1] : trial}</span>
      <span className="truncate text-muted">{arm.replace(/ vs .*$/, '')}</span>
    </p>
  );
}

/** "-1.62 mmHg" for a difference, "OR 0.52" for a ratio. */
function EffectLine({ p, digits }: { p: Party; digits: number }) {
  const ratio = isRatio(p.effect.measure) || !p.unit;
  return (
    <span className="flex h-6 items-center justify-end whitespace-nowrap" title={p.effectText}>
      {ratio && <span className="mr-1 text-xs text-muted">{p.effect.measure}</span>}
      {p.effect.value.toFixed(digits)}
      {!ratio && <span className={`font-sans text-xs text-muted ${p.unit === '%' ? '' : 'ml-1'}`}>{unitSuffix(p.unit).trim()}</span>}
    </span>
  );
}

/** Ranked contradictions. One row each: the two results on a shared axis, what differs between the trials, the ranking score. */
export function ContradictionTable({ items }: { items: ContradictionSummary[] }) {
  return (
    <div className="card overflow-hidden">
      <div className={`hidden border-b border-border bg-sunken px-4 py-2 lg:grid lg:gap-4 ${GRID}`}>
        {['#', 'Endpoint', 'Trials', '', 'Effect', 'Key Difference', 'Score'].map((h, i) => (
          <span key={`${h}-${i}`} className={`eyebrow ${h === 'Effect' || h === 'Score' ? 'text-right' : ''}`}>{h}</span>
        ))}
      </div>
      {items.map((c) => {
        const d = c.discriminatingVariable;
        const values = variableValues(d.a, d.b);
        const digits = Math.abs(c.a.effect.value) < 10 && Math.abs(c.b.effect.value) < 10 ? 2 : 1;
        return (
          <Link key={c.id} href={`/contradictions/${c.id}`} className={`row-link grid gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 lg:items-center ${GRID}`}>
            <span className="num hidden font-mono text-sm text-muted lg:block">{c.rank}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{c.endpoint.label}</span>
              <span className="mt-1 block truncate text-xs text-muted">{typeName(c.type)}{c.alreadyResolvedRef ? ' · Reviewed' : ''}</span>
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
              <EffectLine p={c.a} digits={digits} />
              <EffectLine p={c.b} digits={digits} />
            </span>
            <span className="min-w-0 text-sm">
              {d.basis === 'MEASURED' ? (
                <>
                  <span className="block truncate">{variableName(d.name)}</span>
                  {values && <span className="num block truncate text-xs text-muted">{values}</span>}
                </>
              ) : <span className="text-muted">None Found</span>}
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
