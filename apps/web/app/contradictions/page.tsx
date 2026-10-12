import Link from 'next/link';
import { ContradictionTable } from '@/components/ContradictionTable';
import { Filters } from '@/components/Filters';
import { Count, Empty, PageHeader, Pagination, Tabs } from '@/components/ui';
import { api, qs } from '@/lib/api';
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
  const all = Object.values(list.facets.type).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Contradictions" badges={<Count>{list.total.toLocaleString('en-US')}</Count>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { label: 'All', href: href({ type: undefined }), active: !sp.type, count: all },
            ...TYPES.map((t) => ({ label: <span className="font-mono">{t}</span>, href: href({ type: t }), active: sp.type === t, count: list.facets.type[t] ?? 0 })),
          ]}
        />
        <Filters
          search={{ name: 'q', placeholder: 'Search' }}
          selects={[
            { name: 'endpoint', label: 'Endpoint', options: [{ value: '', label: 'All Endpoints' }, ...endpoints.filter((e) => e.contradictions > 0).map((e) => ({ value: e.id, label: e.label }))] },
            { name: 'discriminator', label: 'Variable', options: [{ value: '', label: 'Any Variable' }, { value: 'named', label: 'Named' }, { value: 'unidentified', label: 'Unidentified' }] },
            { name: 'sort', label: 'Sort', options: [{ value: '', label: 'By Value' }, { value: 'severity', label: 'By Severity' }, { value: 'gate', label: 'By Gate Score' }] },
          ]}
        />
      </div>

      {list.items.length === 0 ? (
        <Empty title="No Matches">{filtered && <Link className="link" href="/contradictions">Clear Filters</Link>}</Empty>
      ) : (
        <>
          <ContradictionTable items={list.items} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href({ page: String(p) })} />
        </>
      )}
    </>
  );
}
