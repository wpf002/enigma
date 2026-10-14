import Link from 'next/link';
import { n } from '@/lib/format';

/** Horizontal bars, one per gate dimension. The value is printed beside each bar. */
export function DimensionBars({ rows, hrefFor, active }: { rows: { dimension: string; label: string; value: number }[]; hrefFor?: (dimension: string) => string; active?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col">
      {rows.map((r) => {
        const on = active === r.dimension;
        const inner = (
          <div className={`grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)_64px] items-center gap-3 rounded-sm px-2 py-2 ${hrefFor ? 'row-link' : ''} ${on ? 'bg-sunken' : ''}`}>
            <span className={`truncate text-sm ${on ? 'font-medium' : ''}`}>{r.label}</span>
            <span className="block h-2"><span className={`block h-2 rounded-r-sm ${on ? 'bg-accent' : 'bg-mark'}`} style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} /></span>
            <span className="num text-right text-sm">{n(r.value)}</span>
          </div>
        );
        return hrefFor ? <Link key={r.dimension} href={hrefFor(r.dimension)} title={`${r.label}: ${n(r.value)}`}>{inner}</Link> : <div key={r.dimension} title={`${r.label}: ${n(r.value)}`}>{inner}</div>;
      })}
    </div>
  );
}
