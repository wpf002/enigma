import Link from 'next/link';
import { ClusterGraph } from '@/components/ClusterGraph';
import { Count, Empty, PageHeader, TypeBadge } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n, pct, titleCase } from '@/lib/format';
import type { MapResponse } from '@/lib/types';

export const metadata = { title: 'Map' };

export default async function MapPage({ searchParams }: { searchParams: { endpoint?: string; agent?: string } }) {
  const map = await api<MapResponse>(`/v1/map${qs({ endpoint: searchParams.endpoint, agent: searchParams.agent, limit: 30 })}`);
  const selected = map.endpoints.find((e) => e.id === searchParams.endpoint);
  return (
    <>
      <PageHeader title="Map" badges={<Count>{map.clusters.length} of {n(selected?.clusters ?? map.totalClusters)} Clusters</Count>} meta="Gate-Pass Edges Only" />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Endpoint">
        <Link href="/map" className={`chip ${!searchParams.endpoint ? 'chip-accent' : ''}`}>All</Link>
        {map.endpoints.filter((e) => e.contradictions > 0).slice(0, 14).map((e) => (
          <Link key={e.id} href={`/map?endpoint=${e.id}`} className={`chip ${searchParams.endpoint === e.id ? 'chip-accent' : ''}`}>
            {e.label} <span className="num font-mono">{e.contradictions}</span>
          </Link>
        ))}
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-mark" />Trial</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />In Conflict</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full border-2 border-mark" />Terminated</li>
        <li className="flex items-center gap-2"><span className="h-px w-4 bg-mark-soft" />Comparable</li>
        <li className="flex items-center gap-2"><span className="h-[3px] w-4 bg-accent" />Contradiction</li>
      </ul>

      {map.clusters.length === 0 ? (
        <Empty title="No Clusters"><Link className="link" href="/map">Show All</Link></Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {map.clusters.map((c) => (
            <section key={c.id} className="card flex flex-col">
              <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold" title={c.label}>{c.agents.map((a) => a.label).join(' + ')}</h2>
                  <p className="truncate text-xs text-muted">{c.endpoint.label} · vs {titleCase(c.comparatorClass ?? 'Control')}</p>
                </div>
                {c.contradictionCount > 0 && <span className="num rounded-full bg-accent px-2 font-mono text-xs font-medium text-accent-fg">{c.contradictionCount}</span>}
              </header>
              <ClusterGraph cluster={c} />
              <dl className="mt-auto grid grid-cols-3 divide-x divide-border border-t border-border text-xs">
                <div className="px-4 py-2"><dt className="text-muted">Trials</dt><dd className="num font-mono text-sm">{c.k}</dd></div>
                <div className="px-4 py-2"><dt className="text-muted">N</dt><dd className="num font-mono text-sm">{n(c.nPatients)}</dd></div>
                <div className="px-4 py-2"><dt className="text-muted">I²</dt><dd className="num font-mono text-sm">{pct(c.i2)}</dd></div>
              </dl>
              {c.clusterFindings.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-xs">
                  {c.clusterFindings.map((f) => <Link key={f.id} href={`/contradictions/${f.id}`} className="link"><TypeBadge type={f.type} /> <span className="num font-mono">#{f.rank}</span></Link>)}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
