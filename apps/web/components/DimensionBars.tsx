import Link from 'next/link';
import { n } from '@/lib/format';

/** Horizontal bars, one per gate dimension. Value is printed beside each bar. */
export function DimensionBars({ rows, hrefFor, active }: { rows: { dimension: string; label: string; value: number }[]; hrefFor?: (dimension: string) => string; active?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const inner = (
          <div className={`grid grid-cols-[144px_minmax(0,1fr)_72px] items-center gap-3 rounded-sm px-2 py-1 ${hrefFor ? 'row-link' : ''} ${active === r.dimension ? 'bg-sunken' : ''}`}>
            <span className={`truncate text-sm ${active === r.dimension ? 'font-medium' : ''}`}>{r.label}</span>
            <div className="h-3">
              <div className={`h-3 rounded-r-sm ${active === r.dimension ? 'bg-accent' : 'bg-mark'}`} style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%` }} />
            </div>
            <span className="num text-right text-sm">{n(r.value)}</span>
          </div>
        );
        return hrefFor ? <Link key={r.dimension} href={hrefFor(r.dimension)} title={`${r.label}: ${n(r.value)} pairs`}>{inner}</Link> : <div key={r.dimension} title={`${r.label}: ${n(r.value)} pairs`}>{inner}</div>;
      })}
    </div>
  );
}
