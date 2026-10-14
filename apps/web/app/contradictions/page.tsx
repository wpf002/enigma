import Link from 'next/link';
import { ContradictionTable } from '@/components/ContradictionTable';
import { Filters } from '@/components/Filters';
import { Empty, PageHeader, Pagination } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n } from '@/lib/format';
import { TYPES, typeName } from '@/lib/labels';
import type { ContradictionList, EndpointRow } from '@/lib/types';

export const metadata = { title: 'Contradictions' };

type Params = Record<string, string | undefined>;

export default async function ContradictionsPage({ searchParams }: { searchParams: Params }) {
  const sp = searchParams;
  const [list, endpoints] = await Promise.all([
    api<ContradictionList>(`/v1/contradictions${qs({ type: sp.type, endpoint: sp.endpoint, agent: sp.agent, trial: sp.trial, q: sp.q, resolved: sp.resolved, sort: sp.sort, page: sp.page, pageSize: '20' })}`),
    api<EndpointRow[]>('/v1/endpoints'),
  ]);
  const href = (patch: Params) => `/contradictions${qs({ ...sp, page: undefined, ...patch })}`;
  const filtered = Boolean(sp.type || sp.endpoint || sp.agent || sp.trial || sp.q || sp.resolved);

  return (
    <>
      <PageHeader title="Contradictions" meta={`${n(list.total)} ${filtered ? 'Matching' : 'Ranked by Score'}`} />

      <div className="mb-4">
        <Filters
          search={{ name: 'q', placeholder: 'Search' }}
          selects={[
            { name: 'type', label: 'Type', options: [{ value: '', label: 'All Types' }, ...TYPES.map((t) => ({ value: t, label: typeName(t) }))] },
            { name: 'endpoint', label: 'Endpoint', options: [{ value: '', label: 'All Endpoints' }, ...endpoints.filter((e) => e.contradictions > 0).map((e) => ({ value: e.id, label: e.label }))] },
            { name: 'sort', label: 'Sort', options: [{ value: '', label: 'By Score' }, { value: 'severity', label: 'By Severity' }, { value: 'gate', label: 'By Gate Score' }] },
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
