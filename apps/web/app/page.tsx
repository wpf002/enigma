import Link from 'next/link';
import { ContradictionRow } from '@/components/ContradictionRow';
import { DimensionBars } from '@/components/DimensionBars';
import { IconArrow } from '@/components/icons';
import { Empty, PageHeader, Section, Stat, StatusBadge, TypeBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { n, pct, TYPE_BLURB } from '@/lib/format';
import type { Overview } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  C1: 'Direction conflict', C2: 'Magnitude incompatibility', C3: 'Null / effect conflict', C4: 'Heterogeneity anomaly', C5: 'Temporal reversal',
};

export default async function OverviewPage() {
  const o = await api<Overview>('/v1/overview');
  const c = o.counts;
  const steps = [
    { label: 'Trials with results', value: c.trials, note: `${n(c.terminatedTrials)} terminated, kept as signal` },
    { label: 'Effect records', value: c.effectRecords, note: `${n(c.mappedRecords)} mapped to an endpoint` },
    { label: 'Candidate pairs', value: c.candidatePairs, note: 'after blocking, never all pairs' },
    { label: 'Passed the gate', value: c.passedPairs, note: `${pct(c.candidatePairs ? c.passedPairs / c.candidatePairs : 0, 1)} of candidates` },
    { label: 'Contradictions', value: c.contradictions, note: `across ${n(c.clusters)} clusters` },
  ];
  return (
    <>
      <PageHeader eyebrow="Type 2 diabetes · cardiovascular outcomes" title={`${n(c.contradictions)} pairs of results that cannot both hold`}>
        Each one passed an eight-dimension comparability gate before it was tested. {n(c.apparentConflictsDissolved)} other pairs look
        contradictory on their headline numbers and were stopped at the gate.
      </PageHeader>

      {o.snapshot.source !== 'AACT_DUMP' && (
        <p className="card mb-12 border-accent px-4 py-3 text-sm">
          <span className="font-medium">This snapshot is not an AACT dump.</span> It was built from the public ClinicalTrials.gov API into the same
          tables. The harmonization rules have not been reviewed by a clinician ({o.ruleSet.rulesReviewed} of {o.ruleSet.rulesTotal}).{' '}
          <Link className="link" href="/status">See gates and rules</Link>.
        </p>
      )}

      <section className="mb-16" aria-label="Pipeline">
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.label} className="relative border-t-2 border-text pt-4">
              <Stat label={s.label} value={n(s.value)} note={s.note} />
              {i < steps.length - 1 && <IconArrow className="absolute -right-4 top-4 hidden text-muted lg:block" />}
            </li>
          ))}
        </ol>
      </section>

      <Section title="Highest diagnostic value" aside={<Link className="link" href="/contradictions">All {n(c.contradictions)}</Link>}>
        {o.top.length === 0 ? (
          <Empty title="No contradictions in this snapshot">Run the pipeline with `pnpm ingest pipeline`.</Empty>
        ) : (
          <div className="card overflow-hidden">{o.top.map((item) => <ContradictionRow key={item.id} c={item} />)}</div>
        )}
      </Section>

      <div className="grid gap-12 lg:grid-cols-2">
        <Section title="Where the gate stopped pairs" aside={<Link className="link" href="/failures">Not comparable</Link>}>
          <p className="mb-4 max-w-prose text-sm text-muted">
            {n(c.failedPairs)} candidate pairs failed. Each bar counts the pairs whose lowest-scoring dimension was that one. The gate score is the
            minimum across dimensions, never the mean.
          </p>
          <div className="card p-4">
            <DimensionBars rows={o.failuresByDimension.map((d) => ({ dimension: d.dimension, label: d.label, value: d.count }))} hrefFor={(d) => `/failures?dimension=${d}&apparent=any`} />
          </div>
        </Section>

        <Section title="By type">
          <div className="card">
            {Object.entries(c.byType).map(([type, count]) => (
              <Link key={type} href={`/contradictions?type=${type}`} className="row-link grid grid-cols-[minmax(0,1fr)_64px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <TypeBadge type={type} label={TYPE_LABEL[type]} />
                  <p className="mt-1 text-sm text-muted">{TYPE_BLURB[type]}</p>
                </div>
                <span className="num text-right text-lg font-bold">{n(count)}</span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Roadmap exit gates" aside={<Link className="link" href="/status">Detail</Link>}>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr><th className="th w-12">Phase</th><th className="th">Criterion</th><th className="th w-28">Status</th><th className="th">Measured</th></tr>
            </thead>
            <tbody>
              {o.gates.map((g) => (
                <tr key={g.phase}>
                  <td className="td num font-mono">{g.phase}</td>
                  <td className="td"><span className="font-medium">{g.name}</span><span className="block text-muted">{g.criterion}</span></td>
                  <td className="td"><StatusBadge status={g.status} /></td>
                  <td className="td text-muted">{g.measured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
