import Link from 'next/link';
import { ClusterGraph } from '@/components/ClusterGraph';
import { Empty, PageHeader, TypeBadge } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n, pct } from '@/lib/format';
import type { MapResponse } from '@/lib/types';

export const metadata = { title: 'Contradiction map' };

export default async function MapPage({ searchParams }: { searchParams: { endpoint?: string; agent?: string } }) {
  const map = await api<MapResponse>(`/v1/map${qs({ endpoint: searchParams.endpoint, agent: searchParams.agent, limit: 30 })}`);
  const selected = map.endpoints.find((e) => e.id === searchParams.endpoint);
  return (
    <>
      <PageHeader eyebrow="Gate-pass edges only" title="Contradiction map">
        Each graph is a cluster: trials of one agent on one endpoint, linked where a pair passed the comparability gate. Pairs that failed the
        gate are not drawn. They are listed under <Link className="link" href="/failures">Not comparable</Link>.
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Endpoint">
        <Link href="/map" className={`chip ${!searchParams.endpoint ? 'chip-accent' : ''}`}>Most contradictions</Link>
        {map.endpoints.slice(0, 14).map((e) => (
          <Link key={e.id} href={`/map?endpoint=${e.id}`} className={`chip ${searchParams.endpoint === e.id ? 'chip-accent' : ''}`}>
            {e.label} <span className="num">{e.contradictions}</span>
          </Link>
        ))}
      </div>

      <ul className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-mark" />Trial, sized by participants</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />Trial in a contradiction</li>
        <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full border-2 border-mark" />Terminated trial</li>
        <li className="flex items-center gap-2"><span className="h-px w-4 bg-mark-soft" />Comparable pair</li>
        <li className="flex items-center gap-2"><span className="h-[3px] w-4 bg-accent" />Contradiction, opens its dossier</li>
      </ul>

      {map.clusters.length === 0 ? (
        <Empty title="No cluster for this selection"><Link className="link" href="/map">Show all</Link></Empty>
      ) : (
        <>
          <p className="num mb-3 text-sm text-muted">
            {map.clusters.length} of {n(selected?.clusters ?? map.totalClusters)} clusters{selected ? ` for ${selected.label}` : ''}, most contradictions first
          </p>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {map.clusters.map((c) => (
              <section key={c.id} className="card flex flex-col">
                <header className="border-b border-border px-4 py-3">
                  <h2 className="truncate text-sm font-bold" title={c.label}>{c.agents.map((a) => a.label).join(' + ')}</h2>
                  <p className="truncate text-xs text-muted">{c.endpoint.label} · vs {(c.comparatorClass ?? 'control').toLowerCase().replace(/_/g, ' ')}</p>
                </header>
                <ClusterGraph cluster={c} />
                <footer className="mt-auto grid grid-cols-4 gap-2 border-t border-border px-4 py-3 text-xs">
                  <div><p className="text-muted">Trials</p><p className="num text-sm font-medium">{c.k}</p></div>
                  <div><p className="text-muted">Patients</p><p className="num text-sm font-medium">{n(c.nPatients)}</p></div>
                  <div><p className="text-muted">I²</p><p className="num text-sm font-medium">{pct(c.i2)}</p></div>
                  <div><p className="text-muted">Conflicts</p><p className="num text-sm font-medium">{c.contradictionCount}</p></div>
                </footer>
                {c.clusterFindings.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-xs">
                    <span className="text-muted">Cluster-level</span>
                    {c.clusterFindings.map((f) => <Link key={f.id} href={`/contradictions/${f.id}`} className="link"><TypeBadge type={f.type} /> rank {f.rank}</Link>)}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
