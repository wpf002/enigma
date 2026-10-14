import Link from 'next/link';
import { ClusterGraph } from '@/components/ClusterGraph';
import { Filters } from '@/components/Filters';
import { Empty, PageHeader } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n, titleCase } from '@/lib/format';
import { typeName } from '@/lib/labels';
import type { MapResponse } from '@/lib/types';

export const metadata = { title: 'Map' };

export default async function MapPage({ searchParams }: { searchParams: { endpoint?: string; agent?: string; cluster?: string } }) {
  const map = await api<MapResponse>(`/v1/map${qs({ endpoint: searchParams.endpoint, agent: searchParams.agent, limit: 30 })}`);
  const selected = map.clusters.find((c) => c.id === searchParams.cluster) ?? map.clusters[0];
  const href = (id: string) => `/map${qs({ endpoint: searchParams.endpoint, agent: searchParams.agent, cluster: id })}`;
  const findings = selected
    ? [...new Map([...selected.links.flatMap((l) => (l.contradiction ? [l.contradiction] : [])), ...selected.clusterFindings].map((f) => [f.id, f])).values()]
        .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    : [];

  return (
    <>
      <PageHeader title="Map" meta={`${n(map.totalClusters)} Groups of Comparable Trials`} />

      <div className="mb-6">
        <Filters selects={[{ name: 'endpoint', label: 'Endpoint', options: [{ value: '', label: 'All Endpoints' }, ...map.endpoints.filter((e) => e.contradictions > 0).map((e) => ({ value: e.id, label: e.label }))] }]} />
      </div>

      {!selected ? (
        <Empty title="No Groups"><Link className="link" href="/map">Show All</Link></Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[288px_minmax(0,1fr)]">
          <div className="relative min-h-0">
            <ul className="card overflow-y-auto lg:absolute lg:inset-0" aria-label="Groups">
              {map.clusters.map((c) => {
                const on = c.id === selected.id;
                return (
                  <li key={c.id} className="border-b border-border last:border-b-0">
                    <Link href={href(c.id)} scroll={false} aria-current={on ? 'true' : undefined} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${on ? 'bg-sunken' : 'row-link'}`}>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${on ? 'font-medium' : ''}`}>{c.agents.map((a) => a.label).join(' + ')}</span>
                        <span className="block truncate text-xs text-muted">{c.endpoint.label} · {c.k} Trials</span>
                      </span>
                      {c.contradictionCount > 0 && <span className="num text-sm font-medium text-accent">{c.contradictionCount}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <section className="card min-w-0">
            <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="display truncate text-lg">{selected.agents.map((a) => a.label).join(' + ')}</h2>
                <p className="truncate text-sm text-muted">{selected.endpoint.label} · vs {titleCase(selected.comparatorClass ?? 'Control')}</p>
              </div>
              <p className="num text-sm text-muted">{selected.k} Trials · {n(selected.nPatients)} Patients</p>
            </header>
            <div className="px-2">
              <ClusterGraph key={selected.id} cluster={selected} height={448} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-3 text-xs text-muted">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-mark-soft" />Trial</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />In Conflict</li>
                <li className="flex items-center gap-2"><span className="h-[2px] w-4 bg-accent" />Contradiction</li>
              </ul>
              <span>Hover a Trial for Details</span>
            </div>
            {findings.length > 0 && (
              <ul className="border-t border-border px-6 py-3 text-sm">
                {findings.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-4 py-1">
                    <Link className="link" href={`/contradictions/${f.id}`}>{typeName(f.type)}</Link>
                    <span className="num text-muted">#{f.rank}</span>
                  </li>
                ))}
                {findings.length > 5 && <li className="pt-1 text-muted">+{findings.length - 5} More</li>}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
