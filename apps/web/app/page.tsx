import Link from 'next/link';
import { ContradictionTable } from '@/components/ContradictionTable';
import { DimensionBars } from '@/components/DimensionBars';
import { Empty, PageHeader, Section, Stat, StatStrip } from '@/components/ui';
import { api } from '@/lib/api';
import { n } from '@/lib/format';
import { dimensionName, typeName } from '@/lib/labels';
import type { Overview } from '@/lib/types';

export default async function OverviewPage() {
  const o = await api<Overview>('/v1/overview');
  const c = o.counts;
  const maxType = Math.max(1, ...Object.values(c.byType));
  return (
    <>
      <PageHeader title="Overview" meta="Type 2 Diabetes Cardiovascular Outcomes" />

      <StatStrip>
        <Stat label="Trials" value={n(c.trials)} />
        <Stat label="Pairs Checked" value={n(c.candidatePairs)} />
        <Stat label="Comparable" value={n(c.passedPairs)} />
        <Stat label="Contradictions" value={<span className="text-accent">{n(c.contradictions)}</span>} />
      </StatStrip>

      <Section title="Top Ranked" aside={<Link className="link" href="/contradictions">View All</Link>}>
        {o.top.length === 0 ? <Empty title="No Contradictions" /> : <ContradictionTable items={o.top.slice(0, 5)} />}
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="By Type">
          <div className="card px-2 py-2">
            {Object.entries(c.byType).map(([type, count]) => (
              <Link key={type} href={`/contradictions?type=${type}`} className="row-link grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)_64px] items-center gap-3 rounded-sm px-2 py-2">
                <span className="truncate text-sm">{typeName(type)}</span>
                <span className="block h-2"><span className="block h-2 rounded-r-sm bg-mark" style={{ width: `${Math.max(1, (count / maxType) * 100)}%` }} /></span>
                <span className="num text-right text-sm">{n(count)}</span>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Mismatches" aside={<Link className="link" href="/mismatches">{n(c.failedPairs)}</Link>}>
          <div className="card px-2 py-2">
            <DimensionBars rows={o.failuresByDimension.map((d) => ({ dimension: d.dimension, label: dimensionName(d.dimension, d.label), value: d.count }))} hrefFor={(d) => `/mismatches?dimension=${d}&apparent=any`} />
          </div>
        </Section>
      </div>
    </>
  );
}
