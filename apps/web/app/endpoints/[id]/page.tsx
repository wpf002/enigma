import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContradictionTable } from '@/components/ContradictionTable';
import { EndpointPicker } from '@/components/EndpointPicker';
import { Filters } from '@/components/Filters';
import { Timeline } from '@/components/Timeline';
import { WatchButton } from '@/components/WatchButton';
import { Empty, PageHeader, Section, Trial } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { n } from '@/lib/format';
import { unitSuffix } from '@/lib/labels';
import type { EndpointRow, TimelineResponse } from '@/lib/types';

const FAMILY: Record<string, string> = {
  glycemic: 'Glycemic Control', cv: 'Cardiovascular', renal: 'Renal', weight: 'Body Weight', bp: 'Blood Pressure', lipids: 'Lipids', hypoglycemia: 'Hypoglycemia',
};

export async function generateMetadata({ params }: { params: { id: string } }) {
  const t = await api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline`).catch(() => null);
  return { title: t ? `${t.endpoint.label} Timeline` : 'Timeline' };
}

export default async function EndpointTimelinePage({ params, searchParams }: { params: { id: string }; searchParams: { agent?: string; measure?: string } }) {
  const [t, rows] = await Promise.all([
    api<TimelineResponse>(`/v1/endpoints/${params.id}/timeline${qs({ agent: searchParams.agent, measure: searchParams.measure })}`).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
    api<EndpointRow[]>('/v1/endpoints'),
  ]);
  const cluster = t.clusters[0];
  const unit = t.points[0]?.units ?? null;
  const conflict = [...new Set(t.contradictions.flatMap((c) => c.nctIds))];
  const families = [...new Set(rows.map((r) => r.family))];
  const groups = families.map((f) => ({
    label: FAMILY[f] ?? f,
    options: rows.filter((r) => r.family === f && r.records > 0 && !r.abstract).sort((a, b) => b.records - a.records).map((r) => ({ id: r.id, label: r.label })),
  })).filter((g) => g.options.length > 0);
  const sorted = [...t.points].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return (
    <>
      <PageHeader title="Timeline" actions={<WatchButton kind="ENDPOINT" value={t.endpoint.id} />} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <EndpointPicker groups={groups} value={t.endpoint.id} />
        {t.agents.length > 0 && (
          <Filters
            selects={[
              { name: 'agent', label: 'Drug', options: t.agents.map((a) => ({ value: a.id, label: a.label })) },
              ...(t.measures.length > 1 ? [{ name: 'measure', label: 'Measure', options: t.measures.map((m) => ({ value: m.id, label: m.id })) }] : []),
            ]}
          />
        )}
        {cluster && <span className="num ml-auto text-sm text-muted">{cluster.k} Trials · {n(cluster.nPatients)} Patients</span>}
      </div>

      {t.agents.length === 0 ? (
        <Empty title="No Comparable Results" />
      ) : (
        <>
          <section className="card mb-12 min-w-0 px-4 pb-4 pt-6">
            <Timeline points={t.points} cumulative={cluster?.stats.cumulative ?? []} measure={t.measure ?? 'MD'} unit={unit} conflict={conflict} />
          </section>

          {t.contradictions.length > 0 && (
            <Section title="Contradictions" aside={t.contradictions.length > 5 && <Link className="link" href={`/contradictions?endpoint=${t.endpoint.id}&agent=${t.agent}`}>View All {t.contradictions.length}</Link>}>
              <ContradictionTable items={t.contradictions.slice(0, 5)} />
            </Section>
          )}

          <Section title="Trials" aside={<span className="num">{sorted.length}</span>}>
            <ol className="card">
              {sorted.map((p) => (
                <li key={p.recordId} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-border px-4 py-2 text-sm last:border-b-0 md:grid-cols-[56px_160px_minmax(0,1fr)_96px_auto]">
                  <span className="num text-muted">{p.date?.slice(0, 4) ?? 'n/a'}</span>
                  <span className="min-w-0 truncate"><Trial nctId={p.nctId} label={p.label} /></span>
                  <span className="hidden truncate text-muted md:block">{p.arm} vs {p.comparator}{p.status === 'TERMINATED' ? ' · Terminated' : ''}</span>
                  <span className="num hidden text-right text-muted md:block">{p.n ? `N ${n(p.n)}` : ''}</span>
                  <span className={`num text-right ${conflict.includes(p.nctId) ? 'font-medium text-accent' : ''}`}>{p.effect.text}{unit && t.measure === 'MD' ? unitSuffix(unit) : ''}</span>
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </>
  );
}
