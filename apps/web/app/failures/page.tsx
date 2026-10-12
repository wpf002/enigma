import Link from 'next/link';
import { DimensionBars } from '@/components/DimensionBars';
import { Empty, PageHeader, Pagination, Section, Stat, StatStrip, Tabs, Trial } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { followUp, n, pct } from '@/lib/format';
import type { FailureList, RecordCard } from '@/lib/types';

export const metadata = { title: 'Gate Failures' };

type Params = Record<string, string | undefined>;

function Side({ r }: { r: RecordCard | null }) {
  if (!r) return <td className="td text-muted">n/a</td>;
  return (
    <td className="td">
      <Trial nctId={r.nctId} label={r.label} />
      <span className="num mt-1 block font-mono">{r.effect.text}{r.units && r.effect.measure === 'MD' ? ` ${r.units}` : ''}</span>
      <span className="block truncate text-muted" title={r.outcomeTitle}>{r.arm} vs {r.comparator}</span>
      <span className="block truncate text-xs text-muted">{r.endpoint.label} · {followUp(r.timepointDays)} · {r.analysisPopulation}</span>
    </td>
  );
}

export default async function FailuresPage({ searchParams }: { searchParams: Params }) {
  const sp = searchParams;
  const apparent = sp.apparent ?? 'true';
  const list = await api<FailureList>(`/v1/failures${qs({ dimension: sp.dimension, reason: sp.reason, endpoint: sp.endpoint, trial: sp.trial, apparent, page: sp.page })}`);
  const s = list.summary;
  const href = (patch: Params) => `/failures${qs({ ...sp, page: undefined, ...patch })}`;
  const onlyApparent = apparent === 'true';
  const top = [...s.byDimension].sort((a, b) => b.apparentDissolved - a.apparentDissolved)[0];
  const filtered = Boolean(sp.dimension || sp.endpoint || sp.trial);

  return (
    <>
      <PageHeader title="Gate Failures" meta="Pairs Stopped Before Testing" />

      <StatStrip>
        <Stat label="Failed Pairs" value={n(s.failed)} />
        <Stat label="Apparent Conflicts" value={n(s.apparentDissolved)} sub={`${pct(s.failed ? s.apparentDissolved / s.failed : 0)} of Failed`} />
        <Stat label="Top Cause" value={<span className="font-sans">{top?.label ?? 'n/a'}</span>} sub={top ? n(top.apparentDissolved) : undefined} />
      </StatStrip>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="By Dimension" aside={sp.dimension && <Link className="link" href={href({ dimension: undefined })}>Clear</Link>}>
          <div className="card p-3">
            <DimensionBars
              active={sp.dimension}
              rows={s.byDimension.map((d) => ({ dimension: d.dimension, label: d.label, value: onlyApparent ? d.apparentDissolved : d.failed }))}
              hrefFor={(d) => href({ dimension: sp.dimension === d ? undefined : d })}
            />
          </div>
        </Section>
        <Section title="Top Groups">
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead><tr><th className="th">Agent</th><th className="th">Endpoint</th><th className="th">Differs On</th><th className="th text-right">Pairs</th></tr></thead>
              <tbody>
                {s.groups.slice(0, 8).map((g) => (
                  <tr key={`${g.blockKey}-${g.dimension}`} className="row-link">
                    <td className="td font-medium"><Link href={href({ endpoint: g.endpoint.id, dimension: g.dimension })}>{g.intervention}</Link></td>
                    <td className="td">{g.endpoint.label}</td>
                    <td className="td text-muted">{g.dimensionLabel}</td>
                    <td className="td num text-right font-mono">{n(g.pairs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section
        title="Pairs"
        aside={
          <span className="flex flex-wrap items-center gap-3">
            {filtered && <Link className="link" href="/failures">Clear Filters</Link>}
            <Tabs items={[{ label: 'Apparent Conflicts', href: href({ apparent: 'true' }), active: onlyApparent }, { label: 'All Failed', href: href({ apparent: 'any' }), active: !onlyApparent }]} />
          </span>
        }
      >
        {list.items.length === 0 ? (
          <Empty title="No Matches"><Link className="link" href="/failures">Clear Filters</Link></Empty>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[880px] table-fixed border-collapse">
                <thead><tr><th className="th">Result A</th><th className="th">Result B</th><th className="th w-72">Failed On</th><th className="th w-20 text-right">Gate</th></tr></thead>
                <tbody>
                  {list.items.map((e) => (
                    <tr key={e.id}>
                      <Side r={e.a} />
                      <Side r={e.b} />
                      <td className="td">
                        {e.failureReasons.map((r) => (
                          <span key={r.dimension} className="mb-1 block" title={r.text}>
                            <span className="font-medium">{r.label}</span>
                            <span className="block text-xs text-muted">{r.text}</span>
                          </span>
                        ))}
                      </td>
                      <td className="td num text-right font-mono">{e.gateScore.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href({ page: String(p) })} />
          </>
        )}
      </Section>
    </>
  );
}
