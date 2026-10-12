'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isRatio } from '@/lib/format';
import type { CumulativePoint, TimelinePoint } from '@/lib/types';
import { useWidth } from './useWidth';

const HEIGHT = 360;
const M = { top: 16, right: 24, bottom: 40, left: 56 };

function ticks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Evidence timeline for one endpoint and agent. Each point is one trial comparison at its completion
 * date, with its 95% interval. The line is the cumulative random-effects pooled estimate of the cluster.
 */
export function Timeline({ points, cumulative, measure, unit, conflict }: { points: TimelinePoint[]; cumulative: CumulativePoint[]; measure: string; unit: string | null; conflict: string[] }) {
  const router = useRouter();
  const [ref, width] = useWidth<HTMLDivElement>(800);
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ratio = isRatio(measure);
  const inConflict = useMemo(() => new Set(conflict), [conflict]);
  const dated = useMemo(() => points.filter((p) => p.date), [points]);

  const scale = useMemo(() => {
    const f = (v: number) => (ratio ? Math.log(v) : v);
    const t = (d: string) => new Date(d).getTime();
    const times = [...dated.map((p) => t(p.date!)), ...cumulative.filter((c) => c.date).map((c) => t(c.date!))];
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const padT = Math.max((t1 - t0) * 0.04, 86400000 * 120);
    const values = dated.flatMap((p) => [p.effect.value, p.effect.ciLow, p.effect.ciHigh]).filter((v) => Number.isFinite(v) && (!ratio || v > 0)).map(f);
    const pooled = cumulative.flatMap((c) => [c.ciLow, c.ciHigh]);
    // the axis follows the point estimates; long intervals are clipped at the frame rather than flattening everything else
    const estimates = dated.map((p) => f(p.effect.value));
    const lo = Math.min(0, ...estimates, ...pooled);
    const hi = Math.max(0, ...estimates, ...pooled);
    const span = hi - lo || 1;
    const y0 = Math.max(Math.min(...values, lo), lo - span * 0.6);
    const y1 = Math.min(Math.max(...values, hi), hi + span * 0.6);
    const pad = (y1 - y0) * 0.06 || 0.2;
    const [min, max] = [y0 - pad, y1 + pad];
    const iw = width - M.left - M.right;
    const ih = HEIGHT - M.top - M.bottom;
    return {
      f, t,
      x: (d: string) => M.left + ((t(d) - (t0 - padT)) / (t1 + padT - (t0 - padT))) * iw,
      y: (v: number) => M.top + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * ih,
      min, max, t0: t0 - padT, t1: t1 + padT, iw, ih,
    };
  }, [dated, cumulative, ratio, width]);

  if (dated.length === 0) return <p className="card px-6 py-12 text-center text-sm text-muted">No dated results for this selection.</p>;
  if (!mounted) return <div ref={ref} style={{ height: HEIGHT }} aria-busy="true" />;

  const { x, y, f } = scale;
  const yTicks = ticks(scale.min, scale.max, 5);
  const startYear = new Date(scale.t0).getUTCFullYear() + 1;
  const endYear = new Date(scale.t1).getUTCFullYear();
  const yearStep = Math.max(1, Math.ceil((endYear - startYear + 1) / Math.max(2, Math.floor(scale.iw / 72))));
  const years: number[] = [];
  for (let yr = startYear; yr <= endYear; yr += yearStep) years.push(yr);
  const fmt = (theta: number) => (ratio ? Math.exp(theta) : theta).toFixed(ratio ? 2 : Math.abs(scale.max - scale.min) < 20 ? 1 : 0);
  const pooledLine = cumulative.filter((c) => c.date && c.k >= 2);
  const band = pooledLine.length > 1
    ? `M${pooledLine.map((c) => `${x(c.date!)},${y(c.ciHigh)}`).join('L')}L${[...pooledLine].reverse().map((c) => `${x(c.date!)},${y(c.ciLow)}`).join('L')}Z`
    : null;
  const active = hover === null ? null : dated[hover]!;

  const nearest = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + M.left;
    const py = e.clientY - box.top + M.top;
    let best = 0;
    let bestD = Infinity;
    dated.forEach((p, i) => {
      const d = (x(p.date!) - px) ** 2 + ((y(f(p.effect.value)) - py) ** 2) / 4;
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  };

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label={`${measure} by trial completion date, ${dated.length} trial comparisons`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</text>
          </g>
        ))}
        {years.map((yr) => (
          <text key={yr} x={x(`${yr}-01-01`)} y={HEIGHT - 16} textAnchor="middle" fontSize={12} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{yr}</text>
        ))}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--text)" strokeWidth={1} />
        <text x={width - M.right} y={y(0) - 6} textAnchor="end" fontSize={12} fill="var(--text-muted)">null</text>
        {band && <path d={band} fill="var(--mark)" fillOpacity={0.1} />}
        {pooledLine.length > 1 && <path d={`M${pooledLine.map((c) => `${x(c.date!)},${y(c.theta)}`).join('L')}`} fill="none" stroke="var(--mark)" strokeWidth={2} strokeLinejoin="round" />}
        {dated.map((p, i) => {
          const cx = x(p.date!);
          const hit = inConflict.has(p.nctId);
          const color = hit ? 'var(--accent)' : 'var(--mark-soft)';
          const terminated = p.status === 'TERMINATED';
          return (
            <g key={p.recordId} opacity={hover === null || hover === i ? 1 : 0.45}>
              <line x1={cx} x2={cx} y1={y(f(p.effect.ciLow))} y2={y(f(p.effect.ciHigh))} stroke={color} strokeWidth={hover === i ? 2 : 1} />
              <circle cx={cx} cy={y(f(p.effect.value))} r={hover === i ? 6 : 4.5} fill={terminated ? 'var(--surface)' : hit ? 'var(--accent)' : 'var(--mark)'} stroke={terminated ? 'var(--mark)' : 'var(--surface)'} strokeWidth={2} />
            </g>
          );
        })}
        {active && <line x1={x(active.date!)} x2={x(active.date!)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 3" />}
        <rect
          x={M.left} y={M.top} width={scale.iw} height={scale.ih} fill="transparent" style={{ cursor: active ? 'pointer' : 'default' }}
          onMouseMove={nearest} onMouseLeave={() => setHover(null)} onClick={() => active && router.push(`/trials/${active.nctId}`)}
        />
      </svg>
      {active && (
        <div className="card pointer-events-none absolute z-10 w-64 px-3 py-2 text-xs shadow-float" style={{ left: Math.max(0, Math.min(width - 256, x(active.date!) + 12)), top: M.top }}>
          <p className="num text-sm font-bold">{active.effect.text}{unit && !ratio ? ` ${unit}` : ''}</p>
          <p className="font-medium">{active.label === active.nctId ? active.nctId : `${active.label} · ${active.nctId}`}</p>
          <p className="truncate text-muted">{active.arm} vs {active.comparator}</p>
          <p className="num text-muted">{active.status === 'TERMINATED' ? 'terminated' : 'completed'} {active.date?.slice(0, 7)}{active.n ? ` · n ${active.n.toLocaleString('en-US')}` : ''}</p>
          {inConflict.has(active.nctId) && <p className="mt-1 font-medium">In a contradiction</p>}
        </div>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-mark" />Trial comparison, 95% interval</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />In a contradiction</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full border-2 border-mark" />Terminated trial</li>
        {pooledLine.length > 1 && <li className="flex items-center gap-2"><span className="h-[2px] w-4 bg-mark" />Cumulative pooled estimate</li>}
      </ul>
    </div>
  );
}
