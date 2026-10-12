import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContradictionTable } from '@/components/ContradictionTable';
import { Filters } from '@/components/Filters';
import { Timeline } from '@/components/Timeline';
import { WatchButton } from '@/components/WatchButton';
import { Count, Crumbs, Empty, PageHeader, Section, Trial } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { followUp, n, pct } from '@/lib/format';
import type { TimelineResponse } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = await api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline`).catch(() => null);
  return { title: t ? t.endpoint.label : 'Timeline' };
}

export default async function EndpointTimelinePage({ params, searchParams }: { params: { id: string }; searchParams: { agent?: string; measure?: string } }) {
  const t = await api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline${qs({ agent: searchParams.agent, measure: searchParams.measure })}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const cluster = t.clusters[0];
  const unit = t.points[0]?.units ?? null;
  const conflict = [...new Set(t.contradictions.flatMap((c) => c.nctIds))];

  return (
    <>
      <Crumbs items={[{ label: 'Timeline', href: '/endpoints' }, ...t.endpoint.path.slice(0, -1).map((p) => ({ label: p.label })), { label: t.endpoint.label }]} />
      <PageHeader
        title={t.endpoint.label}
        badges={t.endpoint.lowerIsBetter !== null && <span className="chip">{t.endpoint.lowerIsBetter ? 'Lower Is Better' : 'Higher Is Better'}</span>}
        actions={<WatchButton kind="ENDPOINT" value={t.endpoint.id} />}
      />

      {t.agents.length === 0 ? (
        <Empty title="No Comparable Records" />
      ) : (
        <>
          <section className="card mb-12 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <Filters
                selects={[
                  { name: 'agent', label: 'Agent', options: t.agents.map((a) => ({ value: a.id, label: `${a.label} (${a.records})` })) },
                  { name: 'measure', label: 'Measure', options: t.measures.map((m) => ({ value: m.id, label: `${m.id} (${m.records})` })) },
                ]}
              />
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-muted">{t.measure}{unit && t.measure === 'MD' ? `, ${unit}` : ''}</span>
                {cluster?.stats.pooled && <><Count>{cluster.k} Trials</Count><Count>N {n(cluster.nPatients)}</Count><Count>I² {pct(cluster.stats.pooled.i2)}</Count></>}
              </p>
            </div>
            <div className="px-4 py-4">
              <Timeline points={t.points} cumulative={cluster?.stats.cumulative ?? []} measure={t.measure ?? 'MD'} unit={unit} conflict={conflict} />
            </div>
          </section>

          <Section title="Contradictions" aside={<Count>{t.contradictions.length}</Count>}>
            {t.contradictions.length === 0 ? <Empty title="None" /> : <ContradictionTable items={t.contradictions.slice(0, 8)} />}
            {t.contradictions.length > 8 && <p className="mt-3 text-sm"><Link className="link" href={`/contradictions?endpoint=${t.endpoint.id}&agent=${t.agent}`}>View All</Link></p>}
          </Section>

          <Section title="Data" aside={<Count>{t.points.length}</Count>}>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr><th className="th">Trial</th><th className="th">Arms</th><th className="th w-28">Completed</th><th className="th w-28">Follow-Up</th><th className="th w-24 text-right">N</th><th className="th w-64 text-right">Effect</th></tr>
                </thead>
                <tbody>
                  {t.points.map((p) => (
                    <tr key={p.recordId}>
                      <td className="td"><Trial nctId={p.nctId} label={p.label} />{p.status === 'TERMINATED' && <span className="chip ml-2">Terminated</span>}</td>
                      <td className="td">{p.arm} <span className="text-muted">vs {p.comparator}</span></td>
                      <td className="td num font-mono">{p.date?.slice(0, 7) ?? 'n/a'}</td>
                      <td className="td num">{followUp(p.timepointDays)}</td>
                      <td className="td num text-right font-mono">{n(p.n)}</td>
                      <td className={`td num text-right font-mono ${conflict.includes(p.nctId) ? 'font-medium text-accent' : ''}`}>{p.effect.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
