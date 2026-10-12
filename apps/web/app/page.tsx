import Link from 'next/link';
import { ContradictionTable } from '@/components/ContradictionTable';
import { DimensionBars } from '@/components/DimensionBars';
import { IconChevron } from '@/components/icons';
import { Empty, PageHeader, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { n, pct } from '@/lib/format';
import { dimensionName, typeName } from '@/lib/labels';
import type { Overview } from '@/lib/types';

export default async function OverviewPage() {
  const o = await api<Overview>('/v1/overview');
  const c = o.counts;
  const stages = [
    { label: 'Trials', value: c.trials, sub: `${n(c.terminatedTrials)} Terminated` },
    { label: 'Results', value: c.effectRecords, sub: `${pct(c.effectRecords ? c.mappedRecords / c.effectRecords : 0)} Matched to Endpoints` },
    { label: 'Pairs Checked', value: c.candidatePairs, sub: `${n(c.apparentConflicts)} Apparent Conflicts` },
    { label: 'Comparable', value: c.passedPairs, sub: `${pct(c.candidatePairs ? c.passedPairs / c.candidatePairs : 0, 1)} of Pairs` },
    { label: 'Contradictions', value: c.contradictions, sub: `${n(c.clusters)} Clusters`, accent: true },
  ];
  const maxType = Math.max(1, ...Object.values(c.byType));
  return (
    <>
      <PageHeader
        title="Overview"
        meta="Type 2 Diabetes Cardiovascular Outcomes"
        badges={
          <>
            {o.snapshot.source !== 'AACT_DUMP' && <Link href="/validation" className="chip chip-accent">API Subset</Link>}
            {o.ruleSet.rulesReviewed < o.ruleSet.rulesTotal && <Link href="/validation" className="chip chip-accent">{o.ruleSet.rulesReviewed}/{o.ruleSet.rulesTotal} Rules Reviewed</Link>}
          </>
        }
      />

      <ol className="card mb-12 grid divide-y divide-border lg:grid-cols-5 lg:divide-x lg:divide-y-0" aria-label="Pipeline">
        {stages.map((s, i) => (
          <li key={s.label} className="relative px-4 py-4">
            <p className="eyebrow">{s.label}</p>
            <p className={`num mt-1 font-mono text-xl font-medium ${s.accent ? 'text-accent' : ''}`}>{n(s.value)}</p>
            <p className="num mt-1 text-sm text-muted">{s.sub}</p>
            {i < stages.length - 1 && (
              <span className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted lg:flex">
                <IconChevron width={12} height={12} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <Section title="Top Ranked" aside={<Link className="link" href="/contradictions">View All</Link>}>
        {o.top.length === 0 ? <Empty title="No Contradictions">Run `pnpm ingest pipeline`.</Empty> : <ContradictionTable items={o.top} />}
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-3">
        <Section title="By Type">
          <div className="card">
            {Object.entries(c.byType).map(([type, count]) => (
              <Link key={type} href={`/contradictions?type=${type}`} className="row-link grid grid-cols-[minmax(0,1fr)_48px] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{typeName(type)}</span>
                  <span className="mt-2 block h-1 rounded-full bg-sunken"><span className="block h-1 rounded-full bg-mark" style={{ width: `${(count / maxType) * 100}%` }} /></span>
                </span>
                <span className="num text-right font-mono text-sm font-medium">{n(count)}</span>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Gate Failures" aside={<Link className="link" href="/failures">{n(c.failedPairs)}</Link>}>
          <div className="card p-3">
            <DimensionBars rows={o.failuresByDimension.map((d) => ({ dimension: d.dimension, label: dimensionName(d.dimension, d.label), value: d.count }))} hrefFor={(d) => `/failures?dimension=${d}&apparent=any`} />
          </div>
        </Section>

        <Section title="Validation" aside={<Link className="link" href="/validation">View All</Link>}>
          <div className="card">
            {o.gates.map((g) => (
              <div key={g.phase} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0" title={g.measured}>
                <span className="num font-mono text-muted">{g.phase}</span>
                <span className="truncate">{g.name}</span>
                <StatusBadge status={g.status} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
