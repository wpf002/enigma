import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forest, type ForestRow } from '@/components/Forest';
import { IconArrow, IconBack, IconDownload } from '@/components/icons';
import { Provenance } from '@/components/Provenance';
import { Crumbs, Meter, PageHeader, Section, Stat, StatStrip, Trial } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { followUp, isRatio, n, phase, score, splitLabel } from '@/lib/format';
import { dimensionName, typeName, variableName, variableValues } from '@/lib/labels';
import type { ContradictionDetail } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const c = await api<ContradictionDetail>(`/v1/contradictions/${params.id}`).catch(() => null);
  return { title: c ? `${c.endpoint.label} #${c.rank}` : 'Contradiction' };
}

export default async function DossierPage({ params }: { params: { id: string } }) {
  const c = await api<ContradictionDetail>(`/v1/contradictions/${params.id}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const d = c.dossier?.body;
  if (!d) notFound();
  const proof = d.comparabilityProof;
  const dv = d.discriminatingVariable;
  const cluster = d.clusterContext;
  const measure = c.a.effect.measure;
  const pooled = cluster?.stats.pooled ?? null;
  const conflictTrials = new Set(c.nctIds);
  const toNatural = (theta: number) => (isRatio(measure) ? Math.exp(theta) : theta);
  const digits = isRatio(measure) || (Math.abs(c.a.effect.value) < 10 && Math.abs(c.b.effect.value) < 10) ? 2 : 1;

  const trialName = (label: string) => {
    const [trial] = splitLabel(label);
    const named = trial.match(/^(.+) \((NCT\d+)\)$/);
    return named ? { name: named[1]!, id: named[2]! } : { name: trial, id: trial };
  };
  const pair: ForestRow[] = [c.a, c.b].map((p, i) => ({
    key: i === 0 ? 'a' : 'b', label: `${i === 0 ? 'A' : 'B'}  ${trialName(p.label).name}`, value: p.effect.value, ciLow: p.effect.ciLow, ciHigh: p.effect.ciHigh, kind: 'accent' as const,
  }));
  const clusterRows: ForestRow[] = cluster && cluster.measure === measure
    ? [
        ...cluster.members.map((m) => ({
          key: m.recordId, label: m.label,
          sub: [m.arm, m.completionDate?.slice(0, 7), m.status === 'TERMINATED' ? 'Terminated' : null].filter(Boolean).join(' · '),
          value: m.value, ciLow: m.ciLow, ciHigh: m.ciHigh, href: `/trials/${m.nctId}`,
          kind: conflictTrials.has(m.nctId) ? ('accent' as const) : m.status === 'TERMINATED' ? ('hollow' as const) : undefined,
        })),
        ...(pooled ? [{ key: 'pooled', label: `Pooled (${pooled.k})`, value: toNatural(pooled.thetaRandom), ciLow: toNatural(pooled.ciLow), ciHigh: toNatural(pooled.ciHigh), kind: 'pooled' as const }] : []),
      ]
    : [];

  const dvValues = variableValues(dv.a, dv.b);

  return (
    <article>
      <Crumbs items={[{ label: 'Contradictions', href: '/contradictions' }, { label: `#${c.rank}` }]} />
      <PageHeader
        title={c.endpoint.label}
        meta={[typeName(c.type), ...c.agents.map((a) => a.label)].join(' · ')}
        actions={
          <>
            <a className="btn btn-primary" href={`/api/v1/contradictions/${c.id}/dossier.pdf`}><IconDownload />Export PDF</a>
            <a className="btn" href={`/api/v1/contradictions/${c.id}/dossier.md`}>Markdown</a>
            {c.prevId ? <Link className="btn px-2" href={`/contradictions/${c.prevId}`} aria-label="Previous" title="Previous"><IconBack /></Link> : <span className="btn px-2" aria-disabled="true"><IconBack /></span>}
            {c.nextId ? <Link className="btn px-2" href={`/contradictions/${c.nextId}`} aria-label="Next" title="Next"><IconArrow /></Link> : <span className="btn px-2" aria-disabled="true"><IconArrow /></span>}
          </>
        }
      />

      <section className="card mb-6" aria-label="Results">
        <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          {[c.a, c.b].map((p, i) => {
            const [, arm] = splitLabel(p.label);
            const t = trialName(p.label);
            return (
              <div key={p.label + i} className="min-w-0 px-6 py-6">
                <p className="flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-fg">{i === 0 ? 'A' : 'B'}</span>
                  <Link className="link truncate font-medium" href={`/trials/${t.id}`}>{t.name}</Link>
                </p>
                <p className="display mt-4 text-xl">
                  {p.effect.value.toFixed(digits)}
                  <span className="ml-2 font-sans text-sm text-muted">{isRatio(measure) ? measure : p.unit ?? measure}</span>
                </p>
                <p className="num mt-1 text-sm text-muted">95% CI {p.effect.ciLow.toFixed(digits)} to {p.effect.ciHigh.toFixed(digits)}</p>
                {arm && <p className="mt-4 truncate text-sm" title={arm}>{arm}</p>}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-6 py-4"><Forest rows={pair} measure={measure} unit={c.a.unit} /></div>
      </section>

      <p className="mb-12 max-w-prose text-sm text-muted">{c.brief}</p>

      <StatStrip>
        <Stat label="Score" value={score(d.diagnosticValue.value)} sub={`Rank ${c.rank}`} />
        <Stat label="Gate Score" value={score(proof.gateScore)} sub={`Threshold ${score(proof.threshold)}`} />
        <Stat label="Key Difference" value={<span className="text-lg">{dv.basis === 'MEASURED' ? variableName(dv.name) : 'None Found'}</span>} sub={dv.basis === 'MEASURED' ? dvValues ?? undefined : undefined} />
      </StatStrip>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Comparability" id="proof">
          <div className="card px-4 py-2">
            {proof.dimensions.map((dim) => {
              const weakest = dim.dimension === proof.weakestDimension;
              return (
                <div key={dim.dimension} className="grid grid-cols-[minmax(0,4fr)_minmax(0,5fr)_40px] items-center gap-3 py-2" title={dim.statement ?? undefined}>
                  <span className={`truncate text-sm ${weakest ? 'font-medium' : ''}`}>{dimensionName(dim.dimension, dim.label)}</span>
                  {dim.score === null ? <span className="text-sm text-muted">Pooled</span> : <Meter value={dim.score} threshold={proof.threshold} emphasize={weakest} />}
                  <span className="num text-right text-sm">{dim.score === null ? '' : score(dim.score)}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Trials" id="trials">
          <div className="card divide-y divide-border">
            {d.parties.map((p) => (
              <div key={p.side} className="px-4 py-4 text-sm">
                {p.trials.slice(0, 3).map((t) => (
                  <div key={t.nctId} className="mb-2 last:mb-0">
                    <p className="flex items-center gap-2"><span className="text-muted">{p.side}</span><Trial nctId={t.nctId} label={t.acronym} />{t.status === 'TERMINATED' && <span className="chip" title={t.whyStopped ?? undefined}>Terminated</span>}</p>
                    <p className="mt-1 line-clamp-2">{t.title}</p>
                    <p className="num text-muted">{[phase(t.phase), t.enrollment ? `${n(t.enrollment)} Patients` : null, t.completionDate?.slice(0, 4)].filter(Boolean).join(' · ')}</p>
                  </div>
                ))}
                {p.trials.length > 3 && <p className="num text-muted">+{p.trials.length - 3} Trials</p>}
                {p.record && <p className="num mt-1 text-muted">{followUp(p.record.timepointDays)} · {p.record.analysisPopulation} · N {n(p.record.nAnalyzed)}</p>}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {cluster && clusterRows.length > 0 && (
        <Section title="Cluster" id="cluster" aside={<span className="num">{cluster.k} Trials · {n(cluster.nPatients)} Patients · <Link className="link" href={`/map?endpoint=${c.endpoint.id}`}>Map</Link></span>}>
          <div className="card px-6 py-4"><Forest rows={clusterRows} measure={measure} unit={c.a.unit} /></div>
        </Section>
      )}

      <details className="group mb-12 border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          <span>Provenance</span><span className="num text-muted">{c.factors.length} Steps</span>
        </summary>
        <div className="mt-4"><Provenance factors={c.factors} /></div>
      </details>

      <footer className="border-t border-border pt-4 text-xs text-muted">
        <p className="font-mono">{d.snapshot.aactVersion} · sha256 {d.snapshot.checksum.slice(0, 16)} · rules {d.ruleSet.version}</p>
        {d.alreadyResolved && <p className="mt-2">Prior Review: {d.alreadyResolved.citation}</p>}
      </footer>
    </article>
  );
}
