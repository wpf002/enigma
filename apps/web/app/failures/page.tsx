import Link from 'next/link';
import { DimensionBars } from '@/components/DimensionBars';
import { IconX } from '@/components/icons';
import { Empty, PageHeader, Pagination, Section, Stat, Trial } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { followUp, n, pct } from '@/lib/format';
import type { FailureList, RecordCard } from '@/lib/types';

export const metadata = { title: 'Not comparable' };

type Params = Record<string, string | undefined>;

function Side({ r, tag }: { r: RecordCard | null; tag: string }) {
  if (!r) return <div className="text-sm text-muted">record not found</div>;
  return (
    <div className="min-w-0 text-sm">
      <p className="mb-1 flex flex-wrap items-center gap-2"><span className="eyebrow">{tag}</span><Trial nctId={r.nctId} label={r.label} /></p>
      <p className="num font-medium">{r.effect.text}{r.units && r.effect.measure === 'MD' ? ` ${r.units}` : ''}</p>
      <p className="truncate">{r.arm} <span className="text-muted">vs {r.comparator}</span></p>
      <p className="truncate text-muted" title={r.outcomeTitle}>{r.endpoint.label} · {followUp(r.timepointDays)} · {r.analysisPopulation}</p>
    </div>
  );
}

export default async function FailuresPage({ searchParams }: { searchParams: Params }) {
  const sp = searchParams;
  const apparent = sp.apparent ?? 'true';
  const list = await api<FailureList>(`/v1/failures${qs({ dimension: sp.dimension, reason: sp.reason, endpoint: sp.endpoint, trial: sp.trial, apparent, page: sp.page })}`);
  const s = list.summary;
  const href = (patch: Params) => `/failures${qs({ ...sp, page: undefined, ...patch })}`;
  const onlyApparent = apparent === 'true';

  return (
    <>
      <PageHeader eyebrow="Comparability failures" title={`${n(s.apparentDissolved)} apparent conflicts that are not comparable`}>
        These pairs look contradictory on their headline numbers: opposite significant effects, or intervals that do not overlap. The gate
        stopped each one, with a reason. Enigma makes no claim about them.
      </PageHeader>

      <section className="mb-12 grid gap-6 border-y border-border py-6 sm:grid-cols-3" aria-label="Summary">
        <Stat label="Pairs stopped at the gate" value={n(s.failed)} note="every failed pair is a stored record" />
        <Stat label="Looked contradictory" value={n(s.apparentDissolved)} note={`${pct(s.failed ? s.apparentDissolved / s.failed : 0)} of failed pairs`} />
        <Stat label="Most common cause" value={[...s.byDimension].sort((a, b) => b.apparentDissolved - a.apparentDissolved)[0]?.label ?? 'n/a'} note="lowest-scoring dimension" />
      </section>

      <div className="grid gap-12 lg:grid-cols-2">
        <Section title="By limiting dimension" aside={sp.dimension ? <Link className="link" href={href({ dimension: undefined })}>Clear</Link> : 'Select to filter'}>
          <div className="card p-4">
            <DimensionBars
              active={sp.dimension}
              rows={s.byDimension.map((d) => ({ dimension: d.dimension, label: d.label, value: onlyApparent ? d.apparentDissolved : d.failed }))}
              hrefFor={(d) => href({ dimension: sp.dimension === d ? undefined : d })}
            />
          </div>
        </Section>
        <Section title="Largest groups">
          <div className="card">
            {s.groups.slice(0, 7).map((g) => (
              <Link key={`${g.blockKey}-${g.dimension}`} href={href({ endpoint: g.endpoint.id, dimension: g.dimension })} className="row-link grid grid-cols-[minmax(0,1fr)_64px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{g.intervention} · {g.endpoint.label}</span>
                  <span className="block truncate text-muted">look contradictory, differ on {g.dimensionLabel.toLowerCase()}</span>
                </span>
                <span className="num text-right text-sm font-bold">{n(g.pairs)}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Pairs"
        aside={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={href({ apparent: 'true' })} className={`chip ${onlyApparent ? 'chip-accent' : ''}`}>Look contradictory</Link>
            <Link href={href({ apparent: 'any' })} className={`chip ${!onlyApparent ? 'chip-accent' : ''}`}>All failed pairs</Link>
          </span>
        }
      >
        {list.items.length === 0 ? (
          <Empty title="No failed pair matches"><Link className="link" href="/failures">Clear filters</Link></Empty>
        ) : (
          <>
            <p className="num mb-3 text-sm text-muted">{n(list.total)} pairs, closest to passing first</p>
            <div className="card">
              {list.items.map((e) => (
                <div key={e.id} className="grid gap-4 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <Side r={e.a} tag="A" />
                  <Side r={e.b} tag="B" />
                  <div className="min-w-0 text-sm">
                    <p className="eyebrow mb-1">Not comparable · gate {e.gateScore.toFixed(2)}</p>
                    <ul className="flex flex-col gap-1">
                      {e.failureReasons.map((r) => (
                        <li key={r.dimension} className="flex items-start gap-2">
                          <IconX className="mt-1 shrink-0 text-critical" />
                          <span><span className="font-medium">{r.label}.</span> <span className="text-muted">{r.text}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href({ page: String(p) })} />
          </>
        )}
      </Section>
    </>
  );
}
