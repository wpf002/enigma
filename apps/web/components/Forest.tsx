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

/** Shared axis for a set of rows. Follows the estimates and a typical interval, and clips one very wide interval at the frame. */
function axis(rows: ForestRow[], measure: string) {
  const ratio = isRatio(measure);
  const f = (v: number) => (ratio ? Math.log(v) : v);
  const nullValue = ratio ? 1 : 0;
  const ok = (v: number | null): v is number => v !== null && Number.isFinite(v) && (!ratio || v > 0);
  const centers = rows.map((r) => r.value).filter(ok).map(f);
  const halves = rows.filter((r) => ok(r.ciLow) && ok(r.ciHigh)).map((r) => (f(r.ciHigh!) - f(r.ciLow!)) / 2).sort((a, b) => a - b);
  const typical = halves[Math.floor(halves.length / 2)] ?? 0.5;
  const bounds = rows.flatMap((r) => [r.ciLow, r.ciHigh]).filter(ok).map(f);
  const lo = Math.max(Math.min(f(nullValue), ...centers, ...bounds), Math.min(f(nullValue), ...centers) - 3 * typical);
  const hi = Math.min(Math.max(f(nullValue), ...centers, ...bounds), Math.max(f(nullValue), ...centers) + 3 * typical);
  const pad = (hi - lo) * 0.08 || 0.5;
  const [min, max] = [lo - pad, hi + pad];
  const frac = (v: number) => Math.max(0, Math.min(1, (f(v) - min) / (max - min)));
  const digits = ratio ? 2 : Math.max(Math.abs(lo), Math.abs(hi)) < 10 ? 2 : 1;
  return {
    ratio, nullValue, frac,
    x: (v: number) => `${frac(v) * 100}%`,
    clipped: (v: number | null) => ok(v) && (f(v) < min || f(v) > max),
    fmt: (v: number) => v.toFixed(digits),
    ends: [ratio ? Math.exp(lo) : lo, ratio ? Math.exp(hi) : hi] as [number, number],
  };
}

function Marks({ r, a, measure, height = 'h-6' }: { r: ForestRow; a: ReturnType<typeof axis>; measure: string; height?: string }) {
  const color = r.kind === 'accent' ? 'bg-accent' : 'bg-mark';
  return (
    <div className={`relative ${height}`} title={`${measure} ${a.fmt(r.value)} (${r.ciLow === null ? 'n/a' : a.fmt(r.ciLow)} to ${r.ciHigh === null ? 'n/a' : a.fmt(r.ciHigh)})`}>
      <div className="absolute inset-y-0 w-px bg-border-strong" style={{ left: a.x(a.nullValue) }} />
      {r.ciLow !== null && r.ciHigh !== null && (
        <div className={`absolute top-1/2 h-[2px] -translate-y-1/2 ${color}`} style={{ left: a.x(r.ciLow), width: `calc(${a.x(r.ciHigh)} - ${a.x(r.ciLow)})` }} />
      )}
      {a.clipped(r.ciLow) && <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs leading-none text-muted" aria-hidden>‹</span>}
      {a.clipped(r.ciHigh) && <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs leading-none text-muted" aria-hidden>›</span>}
      {r.kind === 'pooled' ? (
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-mark ring-2 ring-surface" style={{ left: a.x(r.value) }} />
      ) : r.kind === 'hollow' ? (
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mark bg-surface" style={{ left: a.x(r.value), width: 10, height: 10 }} />
      ) : (
        <div className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${color}`} style={{ left: a.x(r.value), width: 10, height: 10 }} />
      )}
    </div>
  );
}

/** Marks only, one row per result on a shared axis. For table cells where the values are printed in other columns. */
export function ForestMarks({ rows, measure }: { rows: ForestRow[]; measure: string }) {
  const a = axis(rows, measure);
  return (
    <div role="img" aria-label={`${measure}: ${rows.map((r) => a.fmt(r.value)).join(' against ')}`}>
      {rows.map((r) => <Marks key={r.key} r={r} a={a} measure={measure} height="h-6" />)}
    </div>
  );
}

/** Forest plot with labels, values and an axis. Every value is also printed. */
export function Forest({ rows, measure, unit }: { rows: ForestRow[]; measure: string; unit?: string | null }) {
  const a = axis(rows, measure);
  const null_ = a.frac(a.nullValue);
  return (
    <div className="num text-sm" role="table" aria-label={`Effect estimates, ${measure}${unit ? ` in ${unit}` : ''}`}>
      {rows.map((r) => {
        const label = (
          <span className={r.kind === 'accent' ? 'font-medium' : ''}>
            {r.label}
            {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
          </span>
        );
        return (
          <div key={r.key} role="row" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border py-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,3fr)]">
            <div role="cell" className="col-span-2 min-w-0 truncate sm:col-span-1">{r.href ? <Link href={r.href} className="link">{label}</Link> : label}</div>
            <div role="cell"><Marks r={r} a={a} measure={measure} /></div>
            <div role="cell" className="whitespace-nowrap text-right">
              <span className="font-medium">{a.fmt(r.value)}</span>
              <span className="text-muted"> ({r.ciLow === null ? 'n/a' : a.fmt(r.ciLow)}, {r.ciHigh === null ? 'n/a' : a.fmt(r.ciHigh)})</span>
            </div>
          </div>
        );
      })}
      <div className="grid gap-4 pt-2 text-xs text-muted sm:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,3fr)]">
        <div>{measure}{unit && !a.ratio ? `, ${unit}` : ''}{a.ratio ? ', Log Scale' : ''}</div>
        <div className="relative hidden h-4 sm:block">
          {null_ > 0.16 && <span className="absolute left-0">{a.fmt(a.ends[0])}</span>}
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.max(4, Math.min(96, null_ * 100))}%` }}>{a.ratio ? '1' : '0'}</span>
          {null_ < 0.84 && <span className="absolute right-0">{a.fmt(a.ends[1])}</span>}
        </div>
        <div className="hidden sm:block" />
      </div>
    </div>
  );
}
