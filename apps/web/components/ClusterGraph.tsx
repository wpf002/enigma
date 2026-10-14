'use client';

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { typeName } from '@/lib/labels';
import type { MapCluster } from '@/lib/types';
import { useWidth } from './useWidth';

interface Node extends SimulationNodeDatum { id: string; r: number }


/**
 * One cluster: trials as nodes, gate-pass comparisons as links. A link drawn in the accent
 * is a contradiction. Pairs that failed the gate are not in this graph at all.
 */
export function ClusterGraph({ cluster, height: HEIGHT = 240 }: { cluster: MapCluster; height?: number }) {
  const router = useRouter();
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  // The layout is computed in the browser only, at the measured width.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const layout = useMemo(() => {
    const nodes: Node[] = cluster.nodes.map((n) => ({ id: n.id, r: Math.max(5, Math.min(13, Math.sqrt(n.effect?.n ?? n.enrollment ?? 60) / 4)) }));
    const links = cluster.links.map((l) => ({ source: l.source, target: l.target }));
    // fixed seed positions on a circle so the layout is the same on every render
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = width / 2 + Math.cos(a) * HEIGHT / 4;
      n.y = HEIGHT / 2 + Math.sin(a) * HEIGHT / 4;
    });
    // dense clusters get weaker links, so the graph spreads instead of collapsing into a knot
    const dense = nodes.length > 10;
    const sim = forceSimulation(nodes)
      .force('link', forceLink<Node, { source: string | Node; target: string | Node }>(links).id((d) => d.id).distance(dense ? HEIGHT / 3 : HEIGHT / 4).strength(dense ? 0.08 : 0.5))
      .force('charge', forceManyBody().strength(dense ? -260 : -400))
      .force('x', forceX(width / 2).strength(0.07))
      .force('y', forceY(HEIGHT / 2).strength(0.12))
      .force('collide', forceCollide<Node>().radius((d) => d.r + (dense ? 5 : 10)))
      .stop();
    for (let i = 0; i < 220; i += 1) sim.tick();
    const pad = 20;
    for (const n of nodes) {
      n.x = Math.max(pad, Math.min(width - pad, n.x ?? 0));
      n.y = Math.max(pad, Math.min(HEIGHT - pad, n.y ?? 0));
    }
    return new Map(nodes.map((n) => [n.id, n]));
  }, [cluster, width, HEIGHT]);

  const inConflict = new Set(cluster.links.filter((l) => l.contradiction).flatMap((l) => [l.source, l.target]));
  // direct labels only while they fit; every node still names itself on hover and focus
  const labelAll = cluster.nodes.length <= 12;
  const labelConflict = inConflict.size <= 10;
  const sorted = [...cluster.links].sort((a, b) => Number(Boolean(a.contradiction)) - Number(Boolean(b.contradiction)));

  if (!mounted) return <div ref={ref} style={{ height: HEIGHT }} aria-busy="true" />;

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label={`${cluster.label}: ${cluster.k} trials, ${cluster.links.length} gate-pass links, ${cluster.contradictionCount} contradictions`}>
        {sorted.map((l) => {
          const a = layout.get(l.source);
          const b = layout.get(l.target);
          if (!a || !b) return null;
          const hit = l.contradiction;
          const show = (e: React.MouseEvent | React.FocusEvent) => {
            const svg = (e.currentTarget as SVGLineElement).ownerSVGElement;
            const box = (svg ?? e.currentTarget).getBoundingClientRect();
            const x = 'clientX' in e ? e.clientX - box.left : ((a.x ?? 0) + (b.x ?? 0)) / 2;
            const y = 'clientY' in e ? e.clientY - box.top : ((a.y ?? 0) + (b.y ?? 0)) / 2;
            setHover({ x, y, title: hit ? `${typeName(hit.type)} · #${hit.rank}` : 'Comparable', lines: [`${cluster.nodes.find((x) => x.id === l.source)?.label ?? l.source} / ${cluster.nodes.find((x) => x.id === l.target)?.label ?? l.target}`] });
          };
          return (
            <g key={`${l.source}-${l.target}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hit ? 'var(--accent)' : 'var(--mark-soft)'} strokeWidth={hit ? 1.5 : 1} strokeOpacity={hit ? 0.75 : 0.12} />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12}
                tabIndex={hit ? 0 : -1} role={hit ? 'link' : undefined} aria-label={hit ? `${hit.type} contradiction between ${l.source} and ${l.target}` : undefined}
                style={{ cursor: hit ? 'pointer' : 'default' }}
                onMouseMove={show} onFocus={show} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                onClick={() => hit && router.push(`/contradictions/${hit.id}`)}
                onKeyDown={(e) => { if (hit && e.key === 'Enter') router.push(`/contradictions/${hit.id}`); }}
              />
            </g>
          );
        })}
        {cluster.nodes.map((n) => {
          const p = layout.get(n.id);
          if (!p) return null;
          const terminated = n.status === 'TERMINATED';
          const show = () => setHover({
            x: p.x ?? 0, y: (p.y ?? 0) - p.r,
            title: n.label === n.id ? n.id : `${n.label} · ${n.id}`,
            lines: [n.effect?.text ?? 'No Effect Record', n.effect?.arm ?? '', `${terminated ? 'Terminated' : 'Completed'}${n.completionDate ? ` ${n.completionDate.slice(0, 7)}` : ''}${n.effect?.n ? ` · N ${n.effect.n.toLocaleString('en-US')}` : ''}`].filter(Boolean),
          });
          return (
            <g key={n.id}>
              <circle
                cx={p.x} cy={p.y} r={p.r}
                fill={terminated ? 'var(--surface)' : inConflict.has(n.id) ? 'var(--accent)' : 'var(--mark-soft)'}
                stroke={terminated ? 'var(--mark)' : 'var(--surface)'} strokeWidth={2}
                tabIndex={0} role="link" aria-label={`${n.label}, ${n.effect?.text ?? ''}`} style={{ cursor: 'pointer' }}
                onMouseEnter={show} onFocus={show} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                onClick={() => router.push(`/trials/${n.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/trials/${n.id}`); }}
              />
              {(labelAll || (labelConflict && inConflict.has(n.id))) && (
                <text x={p.x} y={(p.y ?? 0) + p.r + 12} textAnchor="middle" fontSize={12} fill="var(--text-muted)" style={{ pointerEvents: 'none' }}>
                  {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="card pointer-events-none absolute z-10 w-56 px-3 py-2 text-xs shadow-float" style={{ left: Math.max(0, Math.min(width - 224, hover.x - 112)), top: Math.max(0, hover.y - 84) }}>
          <p className="font-medium">{hover.title}</p>
          {hover.lines.map((line) => <p key={line} className="num truncate text-muted">{line}</p>)}
        </div>
      )}
    </div>
  );
}
