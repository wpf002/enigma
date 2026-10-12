import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContradictionRow } from '@/components/ContradictionRow';
import { Timeline } from '@/components/Timeline';
import { WatchButton } from '@/components/WatchButton';
import { Crumbs, Empty, PageHeader, Section, Trial } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { followUp, n, pct } from '@/lib/format';
import type { TimelineResponse } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = await api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline`).catch(() => null);
  return { title: t ? `${t.endpoint.label} timeline` : 'Timeline' };
}

export default async function EndpointTimelinePage({ params, searchParams }: { params: { id: string }; searchParams: { agent?: string; measure?: string } }) {
  const t = await api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline${qs({ agent: searchParams.agent, measure: searchParams.measure })}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const cluster = t.clusters[0];
  const unit = t.points[0]?.units ?? null;
  const conflict = [...new Set(t.contradictions.flatMap((c) => c.nctIds))];
  const better = t.endpoint.lowerIsBetter === null ? null : t.endpoint.lowerIsBetter ? 'Lower is better.' : 'Higher is better.';

  return (
    <>
      <Crumbs items={[{ label: 'Evidence timeline', href: '/endpoints' }, ...t.endpoint.path.slice(0, -1).map((p) => ({ label: p.label })), { label: t.endpoint.label }]} />
      <PageHeader eyebrow="Evidence timeline" title={t.endpoint.label} actions={<WatchButton kind="ENDPOINT" value={t.endpoint.id} />}>
        One point per trial comparison, placed at the trial&apos;s completion date. {better}
      </PageHeader>

      {t.agents.length === 0 ? (
        <Empty title="No comparable records for this endpoint">Records need a recognized agent and a resolved direction to appear here.</Empty>
      ) : (
        <>
          <form className="mb-6 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Agent</span>
              <select className="field w-full" name="agent" defaultValue={t.agent ?? ''}>
                {t.agents.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.records})</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Measure</span>
              <select className="field w-full" name="measure" defaultValue={t.measure ?? ''}>
                {t.measures.map((m) => <option key={m.id} value={m.id}>{m.id} ({m.records})</option>)}
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Show</button>
          </form>

          <section className="card mb-16 p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-bold">{t.measure}{unit && t.measure === 'MD' ? `, ${unit}` : ''} by completion date</h2>
              {cluster?.stats.pooled && (
                <p className="num text-sm text-muted">
                  Largest cluster: {cluster.k} trials, {n(cluster.nPatients)} participants, I² {pct(cluster.stats.pooled.i2)}
                </p>
              )}
            </div>
            <Timeline points={t.points} cumulative={cluster?.stats.cumulative ?? []} measure={t.measure ?? 'MD'} unit={unit} conflict={conflict} />
          </section>

          <Section title="Contradictions on this endpoint and agent" aside={`${t.contradictions.length} shown`}>
            {t.contradictions.length === 0 ? (
              <Empty title="None">No pair of comparable results for this agent is statistically incompatible.</Empty>
            ) : (
              <div className="card overflow-hidden">{t.contradictions.slice(0, 8).map((c) => <ContradictionRow key={c.id} c={c} />)}</div>
            )}
            {t.contradictions.length > 8 && <p className="mt-3 text-sm"><Link className="link" href={`/contradictions?endpoint=${t.endpoint.id}&agent=${t.agent}`}>All contradictions for this selection</Link></p>}
          </Section>

          <Section title="Table view" aside={`${t.points.length} trial comparisons`}>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr><th className="th">Trial</th><th className="th">Comparison</th><th className="th w-28">Completed</th><th className="th w-28">Follow-up</th><th className="th w-24 text-right">N</th><th className="th w-64 text-right">Effect</th></tr>
                </thead>
                <tbody>
                  {t.points.map((p) => (
                    <tr key={p.recordId}>
                      <td className="td"><Trial nctId={p.nctId} label={p.label} />{p.status === 'TERMINATED' && <span className="chip ml-2">terminated</span>}</td>
                      <td className="td">{p.arm} <span className="text-muted">vs {p.comparator}</span></td>
                      <td className="td num font-mono">{p.date?.slice(0, 7) ?? 'n/a'}</td>
                      <td className="td num">{followUp(p.timepointDays)}</td>
                      <td className="td num text-right font-mono">{n(p.n)}</td>
                      <td className={`td num text-right font-mono ${conflict.includes(p.nctId) ? 'font-medium' : ''}`}>{p.effect.text}</td>
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
