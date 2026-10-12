import Link from 'next/link';
import { isRatio } from '@/lib/format';

export interface ForestRow {
  key: string;
  label: string;
  sub?: string | null;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
  /** accent: one of the two results in conflict. pooled: a pooled estimate, drawn as a diamond. */
  kind?: 'accent' | 'pooled' | 'hollow';
  href?: string;
}

/**
 * Forest plot: one row per result on a shared axis, with the null marked.
 * Built from positioned elements so it stays crisp at any width. Every value is also printed.
 */
export function Forest({ rows, measure, unit, compact }: { rows: ForestRow[]; measure: string; unit?: string | null; compact?: boolean }) {
  const ratio = isRatio(measure);
  const f = (v: number) => (ratio ? Math.log(v) : v);
  const nullValue = ratio ? 1 : 0;
  const ok = (v: number | null): v is number => v !== null && Number.isFinite(v) && (!ratio || v > 0);
  const centers = rows.map((r) => r.value).filter(ok).map(f);
  const halves = rows.filter((r) => ok(r.ciLow) && ok(r.ciHigh)).map((r) => (f(r.ciHigh!) - f(r.ciLow!)) / 2).sort((a, b) => a - b);
  const typical = halves[Math.floor(halves.length / 2)] ?? 0.5;
  const bounds = rows.flatMap((r) => [r.ciLow, r.ciHigh]).filter(ok).map(f);
  // The axis follows the estimates and a typical interval. One very wide interval is clipped at the
  // frame, with a mark, instead of flattening every other row.
  const lo = Math.max(Math.min(f(nullValue), ...centers, ...bounds), Math.min(f(nullValue), ...centers) - 3 * typical);
  const hi = Math.min(Math.max(f(nullValue), ...centers, ...bounds), Math.max(f(nullValue), ...centers) + 3 * typical);
  const pad = (hi - lo) * 0.08 || 0.5;
  const [min, max] = [lo - pad, hi + pad];
  const frac = (v: number) => Math.max(0, Math.min(1, (f(v) - min) / (max - min)));
  const x = (v: number) => `${frac(v) * 100}%`;
  const clipped = (v: number | null) => ok(v) && (f(v) < min || f(v) > max);
  const digits = ratio ? 2 : Math.max(Math.abs(lo), Math.abs(hi)) < 10 ? 2 : 1;
  const fmt = (v: number) => v.toFixed(digits);
  const ends = [ratio ? Math.exp(lo) : lo, ratio ? Math.exp(hi) : hi];

  return (
    <div className="num text-sm" role="table" aria-label={`Effect estimates, ${measure}${unit ? ` in ${unit}` : ''}`}>
      {rows.map((r) => {
        const color = r.kind === 'accent' ? 'bg-accent' : 'bg-mark';
        const label = (
          <span className={r.kind === 'accent' ? 'font-medium' : ''}>
            {r.label}
            {r.sub && !compact && <span className="block truncate text-xs text-muted">{r.sub}</span>}
          </span>
        );
        return (
          <div key={r.key} role="row" className={`grid items-center gap-4 ${compact ? 'grid-cols-[minmax(0,3fr)_minmax(0,2fr)] py-1' : 'grid-cols-[minmax(0,1fr)_auto] gap-y-1 border-b border-border py-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,3fr)]'}`}>
            <div role="cell" className={`min-w-0 truncate ${compact ? '' : 'col-span-2 sm:col-span-1'}`}>
              {r.href ? <Link href={r.href} className="link">{label}</Link> : label}
            </div>
            <div role="cell" className="relative h-6" title={`${measure} ${fmt(r.value)} (${r.ciLow === null ? 'n/a' : fmt(r.ciLow)} to ${r.ciHigh === null ? 'n/a' : fmt(r.ciHigh)})`}>
              <div className="absolute inset-y-0 w-px bg-border-strong" style={{ left: x(nullValue) }} />
              {r.ciLow !== null && r.ciHigh !== null && (
                <div className={`absolute top-1/2 h-[2px] -translate-y-1/2 ${color}`} style={{ left: x(r.ciLow), width: `calc(${x(r.ciHigh)} - ${x(r.ciLow)})` }} />
              )}
              {clipped(r.ciLow) && <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs leading-none text-muted" aria-hidden>‹</span>}
              {clipped(r.ciHigh) && <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs leading-none text-muted" aria-hidden>›</span>}
              {r.kind === 'pooled' ? (
                <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-mark ring-2 ring-surface" style={{ left: x(r.value) }} />
              ) : r.kind === 'hollow' ? (
                <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mark bg-surface" style={{ left: x(r.value), width: 10, height: 10 }} />
              ) : (
                <div className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${color}`} style={{ left: x(r.value), width: 10, height: 10 }} />
              )}
            </div>
            {!compact && (
              <div role="cell" className="whitespace-nowrap text-right">
                <span className="font-medium">{fmt(r.value)}</span>
                <span className="text-muted">
                  {' '}
                  ({r.ciLow === null ? 'n/a' : fmt(r.ciLow)} to {r.ciHigh === null ? 'n/a' : fmt(r.ciHigh)})
                </span>
              </div>
            )}
          </div>
        );
      })}
      {!compact && (
        <div className="grid gap-4 pt-2 text-xs text-muted sm:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,3fr)]">
          <div>
            {measure}
            {unit && !ratio ? `, ${unit}` : ''}
            {ratio ? ', log scale' : ''}
          </div>
          <div className="relative hidden h-4 sm:block">
            {frac(nullValue) > 0.16 && <span className="absolute left-0">{fmt(ends[0]!)}</span>}
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.max(6, Math.min(94, frac(nullValue) * 100))}%` }}>{ratio ? '1 (null)' : '0 (null)'}</span>
            {frac(nullValue) < 0.84 && <span className="absolute right-0">{fmt(ends[1]!)}</span>}
          </div>
          <div className="hidden sm:block" />
        </div>
      )}
    </div>
  );
}
