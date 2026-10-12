import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContradictionRow } from '@/components/ContradictionRow';
import { IconExternal } from '@/components/icons';
import { WatchButton } from '@/components/WatchButton';
import { Crumbs, Empty, PageHeader, Section, Stat } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { followUp, n } from '@/lib/format';
import type { TrialDetail } from '@/lib/types';

export async function generateMetadata({ params }: { params: { nctId: string } }) {
  return { title: params.nctId.toUpperCase() };
}

const BACKGROUND: Record<string, string> = {
  NAIVE: 'Treatment-naive', METFORMIN: 'On metformin', SU: 'On a sulfonylurea', DUAL_ORAL: 'On two oral agents', INSULIN: 'On insulin', UNSPECIFIED: 'Any or not stated',
};

export default async function TrialPage({ params }: { params: { nctId: string } }) {
  const t = await api<TrialDetail>(`/v1/trials/${params.nctId}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const p = t.population;
  const range = (lo: number | null, hi: number | null, unit: string) => (lo === null && hi === null ? 'not encoded' : `${lo ?? 'any'} to ${hi ?? 'any'}${unit}`);
  const failed = Object.values(t.gate.failedByDimension).reduce((a, b) => a + b, 0);
  const byEndpoint = new Map<string, TrialDetail['records']>();
  for (const r of t.records) byEndpoint.set(r.endpoint.label, [...(byEndpoint.get(r.endpoint.label) ?? []), r]);

  return (
    <>
      <Crumbs items={[{ label: 'Trials' }, { label: t.nctId }]} />
      <PageHeader
        eyebrow={[t.acronym, t.nctId, t.phase].filter(Boolean).join(' · ')}
        title={t.title}
        actions={<><WatchButton kind="TRIAL" value={t.nctId} /><a className="btn" href={t.registryUrl} target="_blank" rel="noreferrer">Registry<IconExternal /></a></>}
      >
        {[t.sponsor, t.allocation?.toLowerCase().replace(/_/g, ' '), t.masking ? `${t.masking.toLowerCase()} masking` : null].filter(Boolean).join(' · ')}
      </PageHeader>

      {t.status === 'TERMINATED' && (
        <p className="card mb-12 border-accent px-4 py-3 text-sm">
          <span className="font-medium">Terminated: {(t.stopCategory ?? 'other').toLowerCase()}.</span>{' '}
          {t.whyStopped ? `Registry reason: “${t.whyStopped}”` : 'No reason given in the registry.'} Its results are kept and compared like any other trial.
        </p>
      )}

      <section className="mb-16 grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Enrolled" value={n(t.enrollment)} note={t.completionDate ? `completed ${t.completionDate}` : 'completion date not recorded'} />
        <Stat label="Mapped records" value={n(t.records.length)} note={`${n(t.unmappedRecords)} outside the ontology`} />
        <Stat label="Comparable pairs" value={n(t.gate.passed)} note={`${n(failed)} stopped at the gate`} />
        <Stat label="Contradictions" value={n(t.contradictions.length)} note="involving this trial" />
      </section>

      <Section title="Contradictions">
        {t.contradictions.length === 0 ? <Empty title="None">No comparable result from another trial is statistically incompatible with this one.</Empty> : (
          <div className="card overflow-hidden">{t.contradictions.slice(0, 10).map((c) => <ContradictionRow key={c.id} c={c} />)}</div>
        )}
        {failed > 0 && <p className="mt-3 text-sm"><Link className="link" href={`/failures?trial=${t.nctId}&apparent=any`}>Pairs with this trial that were not comparable</Link></p>}
      </Section>

      <div className="grid gap-12 lg:grid-cols-2">
        <Section title="Encoded population">
          <dl className="card grid grid-cols-[144px_minmax(0,1fr)] gap-x-4 gap-y-3 p-6 text-sm">
            <dt className="text-muted">Age</dt><dd className="num">{range(p.ageMin, p.ageMax, ' years')}{p.baseline?.ageMean ? ` · mean ${p.baseline.ageMean}` : ''}</dd>
            <dt className="text-muted">HbA1c at entry</dt><dd className="num">{range(p.hba1cMin, p.hba1cMax, '%')}{p.baseline?.hba1cMean ? ` · mean ${p.baseline.hba1cMean}%` : ''}</dd>
            <dt className="text-muted">BMI</dt><dd className="num">{range(p.bmiMin, p.bmiMax, '')}</dd>
            <dt className="text-muted">Background therapy</dt><dd>{BACKGROUND[p.background] ?? p.background}</dd>
            <dt className="text-muted">Cardiovascular risk</dt><dd>{p.cvRisk === 'ESTABLISHED_OR_HIGH' ? 'Established disease or high risk required' : 'Not required'}</dd>
            <dt className="text-muted">Renal</dt><dd>{p.renal === 'CKD' ? 'Kidney disease required' : 'Not required'}</dd>
            <dt className="text-muted">Female</dt><dd className="num">{p.baseline?.femalePct !== null && p.baseline?.femalePct !== undefined ? `${p.baseline.femalePct}%` : 'not recorded'}</dd>
          </dl>
          <p className="mt-3 text-sm text-muted">Read from the eligibility criteria and baseline table by rules no clinician has reviewed yet.</p>
        </Section>
        <Section title="Arms">
          <div className="card">
            {t.arms.length === 0 && <p className="px-4 py-3 text-sm text-muted">No arms registered.</p>}
            {t.arms.map((a) => (
              <div key={a.title} className="border-b border-border px-4 py-3 text-sm last:border-b-0">
                <p className="font-medium">{a.title}</p>
                <p className="text-muted">{(a.type ?? 'type not registered').toLowerCase().replace(/_/g, ' ')}{a.agents.length ? ` · ${a.agents.join(', ')}` : a.placebo ? ' · placebo' : ' · no recognized agent'}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Effect records" aside={`${t.records.length} mapped to an endpoint`}>
        {t.records.length === 0 ? <Empty title="No record of this trial maps to an endpoint node" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr><th className="th">Comparison</th><th className="th w-28">Follow-up</th><th className="th w-24">Set</th><th className="th w-32">Source</th><th className="th w-64 text-right">Effect</th></tr></thead>
              {[...byEndpoint.entries()].map(([endpoint, records]) => (
                <tbody key={endpoint}>
                  <tr><td colSpan={5} className="bg-sunken px-3 py-2"><Link className="link text-sm font-medium" href={`/endpoints/${records[0]!.endpoint.id}`}>{endpoint}</Link></td></tr>
                  {records.slice(0, 12).map((r) => (
                    <tr key={r.id}>
                      <td className="td">{r.arm} <span className="text-muted">vs {r.comparator}</span>{!r.directionResolved && <span className="chip ml-2">direction unresolved</span>}</td>
                      <td className="td num">{followUp(r.timepointDays)}</td>
                      <td className="td">{r.analysisPopulation}</td>
                      <td className="td text-muted">{r.sourceKind === 'ANALYSIS' ? 'posted analysis' : 'arm-level data'}</td>
                      <td className="td num text-right font-mono">{r.effect.text}</td>
                    </tr>
                  ))}
                  {records.length > 12 && <tr><td colSpan={5} className="td text-muted">{records.length - 12} more records for this endpoint</td></tr>}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
