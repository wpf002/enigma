import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContradictionTable } from '@/components/ContradictionTable';
import { IconExternal } from '@/components/icons';
import { WatchButton } from '@/components/WatchButton';
import { Count, Crumbs, Empty, PageHeader, Section, Stat, StatStrip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { followUp, n, phase, titleCase } from '@/lib/format';
import type { TrialDetail } from '@/lib/types';

export async function generateMetadata({ params }: { params: { nctId: string } }) {
  return { title: params.nctId.toUpperCase() };
}

const BACKGROUND: Record<string, string> = {
  NAIVE: 'Treatment-Naive', METFORMIN: 'Metformin', SU: 'Sulfonylurea', DUAL_ORAL: 'Two Oral Agents', INSULIN: 'Insulin', UNSPECIFIED: 'Any',
};

export default async function TrialPage({ params }: { params: { nctId: string } }) {
  const t = await api<TrialDetail>(`/v1/trials/${params.nctId}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const p = t.population;
  const range = (lo: number | null, hi: number | null, unit: string) => (lo === null && hi === null ? 'n/a' : `${lo ?? 'Any'} to ${hi ?? 'Any'}${unit}`);
  const failed = Object.values(t.gate.failedByDimension).reduce((a, b) => a + b, 0);
  const byEndpoint = new Map<string, TrialDetail['records']>();
  for (const r of t.records) byEndpoint.set(r.endpoint.label, [...(byEndpoint.get(r.endpoint.label) ?? []), r]);

  return (
    <>
      <Crumbs items={[{ label: 'Trials' }, { label: t.nctId }]} />
      <PageHeader
        title={t.acronym ?? t.nctId}
        badges={
          <>
            {t.acronym && <span className="chip font-mono">{t.nctId}</span>}
            {phase(t.phase) && <span className="chip">{phase(t.phase)}</span>}
            {t.status === 'TERMINATED' && <span className="chip chip-accent" title={t.whyStopped ?? undefined}>Terminated · {titleCase(t.stopCategory ?? 'Other')}</span>}
          </>
        }
        meta={t.title}
        actions={<><WatchButton kind="TRIAL" value={t.nctId} /><a className="btn" href={t.registryUrl} target="_blank" rel="noreferrer">Registry<IconExternal /></a></>}
      />

      <StatStrip>
        <Stat label="Enrolled" value={n(t.enrollment)} sub={t.completionDate?.slice(0, 7)} />
        <Stat label="Records" value={n(t.records.length)} sub={`${n(t.unmappedRecords)} Unmapped`} />
        <Stat label="Gate Passes" value={n(t.gate.passed)} sub={`${n(failed)} Failed`} />
        <Stat label="Contradictions" value={n(t.contradictions.length)} />
      </StatStrip>

      <Section title="Contradictions" aside={failed > 0 && <Link className="link" href={`/failures?trial=${t.nctId}&apparent=any`}>Gate Failures</Link>}>
        {t.contradictions.length === 0 ? <Empty title="None" /> : <ContradictionTable items={t.contradictions.slice(0, 10)} />}
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Population">
          <dl className="card grid grid-cols-[128px_minmax(0,1fr)] gap-x-4 gap-y-3 px-6 py-4 text-sm">
            <dt className="text-muted">Age</dt><dd className="num">{range(p.ageMin, p.ageMax, ' y')}{p.baseline?.ageMean ? ` · Mean ${p.baseline.ageMean}` : ''}</dd>
            <dt className="text-muted">HbA1c</dt><dd className="num">{range(p.hba1cMin, p.hba1cMax, '%')}{p.baseline?.hba1cMean ? ` · Mean ${p.baseline.hba1cMean}%` : ''}</dd>
            <dt className="text-muted">BMI</dt><dd className="num">{range(p.bmiMin, p.bmiMax, '')}</dd>
            <dt className="text-muted">Background</dt><dd>{BACKGROUND[p.background] ?? p.background}</dd>
            <dt className="text-muted">CV Risk</dt><dd>{p.cvRisk === 'ESTABLISHED_OR_HIGH' ? 'Established or High' : 'Not Required'}</dd>
            <dt className="text-muted">Renal</dt><dd>{p.renal === 'CKD' ? 'CKD Required' : 'Not Required'}</dd>
            <dt className="text-muted">Female</dt><dd className="num">{p.baseline?.femalePct !== null && p.baseline?.femalePct !== undefined ? `${p.baseline.femalePct}%` : 'n/a'}</dd>
            <dt className="text-muted">Design</dt><dd>{[t.allocation, t.masking].filter(Boolean).map((x) => titleCase(x!)).join(' · ') || 'n/a'}</dd>
            <dt className="text-muted">Sponsor</dt><dd>{t.sponsor ?? 'n/a'}</dd>
          </dl>
        </Section>
        <Section title="Arms" aside={<Count>{t.arms.length}</Count>}>
          <div className="card">
            {t.arms.length === 0 && <p className="px-4 py-3 text-sm text-muted">None Registered</p>}
            {t.arms.map((a) => (
              <div key={a.title} className="border-b border-border px-4 py-3 text-sm last:border-b-0">
                <p className="font-medium">{a.title}</p>
                <p className="text-muted">{titleCase(a.type ?? 'Untyped')}{a.agents.length ? ` · ${a.agents.join(', ')}` : a.placebo ? ' · Placebo' : ''}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Effect Records" aside={<Count>{t.records.length}</Count>}>
        {t.records.length === 0 ? <Empty title="None Mapped" /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr><th className="th">Arms</th><th className="th w-28">Follow-Up</th><th className="th w-28">Set</th><th className="th w-36">Source</th><th className="th w-64 text-right">Effect</th></tr></thead>
              {[...byEndpoint.entries()].map(([endpoint, records]) => (
                <tbody key={endpoint}>
                  <tr><td colSpan={5} className="bg-sunken px-3 py-2"><Link className="link text-sm font-medium" href={`/endpoints/${records[0]!.endpoint.id}`}>{endpoint}</Link></td></tr>
                  {records.slice(0, 12).map((r) => (
                    <tr key={r.id}>
                      <td className="td">{r.arm} <span className="text-muted">vs {r.comparator}</span>{!r.directionResolved && <span className="chip ml-2">Direction Unresolved</span>}</td>
                      <td className="td num">{followUp(r.timepointDays)}</td>
                      <td className="td">{titleCase(r.analysisPopulation ?? '')}</td>
                      <td className="td text-muted">{r.sourceKind === 'ANALYSIS' ? 'Posted Analysis' : 'Arm-Level Data'}</td>
                      <td className="td num text-right font-mono">{r.effect.text}</td>
                    </tr>
                  ))}
                  {records.length > 12 && <tr><td colSpan={5} className="td num text-muted">+{records.length - 12} More</td></tr>}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
