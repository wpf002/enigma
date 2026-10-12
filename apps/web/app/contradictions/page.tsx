import Link from 'next/link';
import { ContradictionRow } from '@/components/ContradictionRow';
import { Empty, PageHeader, Pagination } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n } from '@/lib/format';
import type { ContradictionList, EndpointRow } from '@/lib/types';

export const metadata = { title: 'Contradictions' };

type Params = Record<string, string | undefined>;

const TYPES = ['C1', 'C2', 'C3', 'C4', 'C5'];

export default async function ContradictionsPage({ searchParams }: { searchParams: Params }) {
  const sp = searchParams;
  const [list, endpoints] = await Promise.all([
    api<ContradictionList>(`/v1/contradictions${qs({ type: sp.type, endpoint: sp.endpoint, agent: sp.agent, trial: sp.trial, q: sp.q, resolved: sp.resolved, discriminator: sp.discriminator, sort: sp.sort, page: sp.page })}`),
    api<EndpointRow[]>('/v1/endpoints'),
  ]);
  const href = (patch: Params) => `/contradictions${qs({ ...sp, page: undefined, ...patch })}`;
  const filtered = Boolean(sp.type || sp.endpoint || sp.agent || sp.trial || sp.q || sp.resolved || sp.discriminator);
  const allTypes = Object.values(list.facets.type).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader eyebrow="Ranked by diagnostic value" title="Contradictions">
        Ranked by how much resolving each one would change: gate confidence, severity, patients in the cluster, what no recorded difference
        explains, and whether a discriminating variable is named.
      </PageHeader>

      <form action="/contradictions" className="mb-6 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        {sp.type && <input type="hidden" name="type" value={sp.type} />}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Search dossiers</span>
          <input className="field w-full" name="q" defaultValue={sp.q ?? ''} placeholder="NCT id, agent, any dossier text" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Endpoint</span>
          <select className="field w-full" name="endpoint" defaultValue={sp.endpoint ?? ''}>
            <option value="">Any endpoint</option>
            {endpoints.filter((e) => e.contradictions > 0).map((e) => <option key={e.id} value={e.id}>{e.label} ({e.contradictions})</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Discriminating variable</span>
          <select className="field w-full" name="discriminator" defaultValue={sp.discriminator ?? ''}>
            <option value="">Any</option>
            <option value="named">Named</option>
            <option value="unidentified">Unidentified</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Sort</span>
          <select className="field w-full" name="sort" defaultValue={sp.sort ?? 'rank'}>
            <option value="rank">Diagnostic value</option>
            <option value="severity">Severity</option>
            <option value="gate">Gate confidence</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Type">
        <Link href={href({ type: undefined })} className={`chip ${!sp.type ? 'chip-accent' : ''}`} aria-current={!sp.type}>All types <span className="num">{n(allTypes)}</span></Link>
        {TYPES.map((t) => (
          <Link key={t} href={href({ type: t })} className={`chip ${sp.type === t ? 'chip-accent' : ''}`} aria-current={sp.type === t}>
            <span className="font-mono">{t}</span> <span className="num">{n(list.facets.type[t] ?? 0)}</span>
          </Link>
        ))}
        {filtered && <Link href="/contradictions" className="link ml-2 text-sm">Clear filters</Link>}
      </div>

      {list.items.length === 0 ? (
        <Empty title="No contradiction matches these filters">
          {filtered ? <Link className="link" href="/contradictions">Clear filters</Link> : 'Run the pipeline with `pnpm ingest pipeline`.'}
        </Empty>
      ) : (
        <>
          <p className="num mb-3 text-sm text-muted">{n(list.total)} {list.total === 1 ? 'result' : 'results'}</p>
          <div className="card overflow-hidden">{list.items.map((c) => <ContradictionRow key={c.id} c={c} />)}</div>
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href({ page: String(p) })} />
        </>
      )}
    </>
  );
}
