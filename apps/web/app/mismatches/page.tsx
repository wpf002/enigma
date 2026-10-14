import Link from 'next/link';
import { Empty, PageHeader, Pagination, Tabs, Trial } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { n } from '@/lib/format';
import { dimensionName, unitSuffix } from '@/lib/labels';
import type { FailureList, RecordCard } from '@/lib/types';

export const metadata = { title: 'Mismatches' };

type Params = Record<string, string | undefined>;

function Side({ r }: { r: RecordCard | null }) {
  if (!r) return <div className="text-sm text-muted">n/a</div>;
  return (
    <div className="min-w-0 text-sm">
      <p className="flex items-baseline justify-between gap-3">
        <Trial nctId={r.nctId} label={r.label} />
        <span className="num whitespace-nowrap" title={r.effect.text}>{r.effect.measure === 'MD' ? '' : `${r.effect.measure} `}{r.effect.value.toFixed(2)}{r.units && r.effect.measure === 'MD' ? unitSuffix(r.units) : ''}</span>
      </p>
      <p className="truncate text-muted" title={r.outcomeTitle}>{r.arm} vs {r.comparator}</p>
    </div>
  );
}

export default async function MismatchesPage({ searchParams }: { searchParams: Params }) {
  const sp = searchParams;
  const apparent = sp.apparent ?? 'true';
  const list = await api<FailureList>(`/v1/failures${qs({ dimension: sp.dimension, reason: sp.reason, endpoint: sp.endpoint, trial: sp.trial, apparent, page: sp.page, pageSize: '20' })}`);
  const s = list.summary;
  const href = (patch: Params) => `/mismatches${qs({ ...sp, page: undefined, ...patch })}`;
  const onlyApparent = apparent === 'true';
  const count = (d: FailureList['summary']['byDimension'][number]) => (onlyApparent ? d.apparentDissolved : d.failed);

  return (
    <>
      <PageHeader title="Mismatches" meta={`${n(s.failed)} Pairs Not Comparable · ${n(s.apparentDissolved)} Looked Like Conflicts`} />

      <div className="grid gap-8 lg:grid-cols-[224px_minmax(0,1fr)]">
        <nav aria-label="Differs On" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm text-muted">Differs On</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            <li>
              <Link href={href({ dimension: undefined })} className={`flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm ${!sp.dimension ? 'bg-sunken font-medium' : 'text-muted hover:bg-sunken hover:text-text'}`}>
                All <span className="num">{n(onlyApparent ? s.apparentDissolved : s.failed)}</span>
              </Link>
            </li>
            {s.byDimension.map((d) => (
              <li key={d.dimension}>
                <Link href={href({ dimension: d.dimension })} className={`flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm ${sp.dimension === d.dimension ? 'bg-sunken font-medium' : 'text-muted hover:bg-sunken hover:text-text'}`}>
                  {dimensionName(d.dimension, d.label)} <span className="num">{n(count(d))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs items={[{ label: 'Looked Like Conflicts', href: href({ apparent: 'true' }), active: onlyApparent }, { label: 'All', href: href({ apparent: 'any' }), active: !onlyApparent }]} />
            {(sp.endpoint || sp.trial) && <Link className="link text-sm" href="/mismatches">Clear Filters</Link>}
          </div>

          {list.items.length === 0 ? (
            <Empty title="No Matches" />
          ) : (
            <>
              <ul className="card">
                {list.items.map((e) => {
                  const [first, ...rest] = e.failureReasons;
                  return (
                    <li key={e.id} className="border-b border-border px-4 py-4 last:border-b-0">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Side r={e.a} />
                        <Side r={e.b} />
                      </div>
                      {first && (
                        <p className="mt-3 text-sm" title={e.failureReasons.map((r) => r.text).join('\n')}>
                          <span className="font-medium">{dimensionName(first.dimension, first.label)}</span>
                          <span className="text-muted"> · {first.text}{rest.length > 0 ? ` +${rest.length}` : ''}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
