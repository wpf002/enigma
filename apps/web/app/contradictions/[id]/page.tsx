import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forest, type ForestRow } from '@/components/Forest';
import { IconArrow, IconBack, IconDownload } from '@/components/icons';
import { Provenance } from '@/components/Provenance';
import { Count, Crumbs, Meter, PageHeader, Section, Stat, StatStrip, Trial, TypeBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { followUp, isRatio, n, pct, phase, pValue, score, splitLabel, titleCase } from '@/lib/format';
import { dimensionName, variableName } from '@/lib/labels';
import type { ContradictionDetail } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const c = await api<ContradictionDetail>(`/v1/contradictions/${params.id}`).catch(() => null);
  return { title: c ? `Dossier ${c.rank}` : 'Dossier' };
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

  const pair: ForestRow[] = [c.a, c.b].map((p, i) => ({
    key: i === 0 ? 'a' : 'b', label: `${i === 0 ? 'A' : 'B'}  ${splitLabel(p.label)[0]}`, value: p.effect.value, ciLow: p.effect.ciLow, ciHigh: p.effect.ciHigh, kind: 'accent' as const,
  }));
  const clusterRows: ForestRow[] = cluster && cluster.measure === measure
    ? [
        ...cluster.members.map((m) => ({
          key: m.recordId, label: m.label === m.nctId ? m.nctId : `${m.label} · ${m.nctId}`,
          sub: [m.arm, m.completionDate?.slice(0, 7), m.status === 'TERMINATED' ? 'Terminated' : null].filter(Boolean).join(' · '),
          value: m.value, ciLow: m.ciLow, ciHigh: m.ciHigh, href: `/trials/${m.nctId}`,
          kind: conflictTrials.has(m.nctId) ? ('accent' as const) : m.status === 'TERMINATED' ? ('hollow' as const) : undefined,
        })),
        ...(pooled ? [{ key: 'pooled', label: `Pooled (${pooled.k})`, value: toNatural(pooled.thetaRandom), ciLow: toNatural(pooled.ciLow), ciHigh: toNatural(pooled.ciHigh), kind: 'pooled' as const }] : []),
      ]
    : [];

  return (
    <article>
      <Crumbs items={[{ label: 'Contradictions', href: '/contradictions' }, { label: `Dossier ${c.rank}` }]} />
      <PageHeader
        title={c.endpoint.label}
        badges={
          <>
            <TypeBadge type={c.type} />
            {c.agents.map((a) => <Link key={a.id} className="chip" href={`/contradictions?agent=${a.id}`}>{a.label}</Link>)}
          </>
        }
        actions={
          <>
            <a className="btn btn-primary" href={`/api/v1/contradictions/${c.id}/dossier.pdf`}><IconDownload />Export PDF</a>
            <a className="btn" href={`/api/v1/contradictions/${c.id}/dossier.md`}>Markdown</a>
            {c.prevId ? <Link className="btn px-2" href={`/contradictions/${c.prevId}`} aria-label="Previous Dossier" title="Previous"><IconBack /></Link> : <span className="btn px-2" aria-disabled="true"><IconBack /></span>}
            {c.nextId ? <Link className="btn px-2" href={`/contradictions/${c.nextId}`} aria-label="Next Dossier" title="Next"><IconArrow /></Link> : <span className="btn px-2" aria-disabled="true"><IconArrow /></span>}
          </>
        }
      />

      <section className="card mb-4" aria-label="Results">
        <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          {[c.a, c.b].map((p, i) => {
            const [trial, arm] = splitLabel(p.label);
            return (
              <div key={trial + i} className="min-w-0 px-6 py-6">
                <p className="flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-accent-fg">{i === 0 ? 'A' : 'B'}</span>
                  <span className="truncate font-mono">{trial}</span>
                </p>
                <p className="num mt-3 font-mono text-xl font-medium">
                  {p.effect.value.toFixed(digits)}
                  <span className="ml-2 text-sm font-normal text-muted">{p.effect.measure}{p.unit ? `, ${p.unit}` : ''}</span>
                </p>
                <p className="num mt-1 font-mono text-sm text-muted">95% CI {p.effect.ciLow.toFixed(digits)} to {p.effect.ciHigh.toFixed(digits)}</p>
                {arm && <p className="mt-3 truncate text-sm" title={arm}>{arm}</p>}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-6 py-4"><Forest rows={pair} measure={measure} unit={c.a.unit} /></div>
      </section>

      <p className="mb-8 border-l-2 border-accent px-4 text-sm text-muted">{c.brief}</p>

      <StatStrip>
        <Stat label="Score" value={score(d.diagnosticValue.value)} sub={`Rank ${c.rank}`} />
        <Stat label="Severity" value={score(d.severity)} />
        <Stat label="Gate Score" value={score(proof.gateScore)} sub={`Threshold ${score(proof.threshold)}`} />
        <Stat
          label="Difference"
          value={d.diagnosticValue.zDiff === null ? `I² ${pct(pooled?.i2)}` : `z ${d.diagnosticValue.zDiff.toFixed(2)}`}
          sub={d.diagnosticValue.qDiff === null ? `${cluster?.k ?? 0} Trials` : `q ${pValue(d.diagnosticValue.qDiff)}`}
        />
      </StatStrip>

      <Section title="Comparability Proof" id="proof" aside={<span className="font-mono">min = {score(proof.gateScore)}</span>}>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr><th className="th w-48">Dimension</th><th className="th w-48">Score</th><th className="th">Condition</th><th className="th w-64">Rule</th></tr>
            </thead>
            <tbody>
              {proof.dimensions.map((dim) => {
                const weakest = dim.dimension === proof.weakestDimension;
                return (
                  <tr key={dim.dimension}>
                    <td className="td font-medium">{dimensionName(dim.dimension, dim.label)}{weakest && <span className="chip chip-accent ml-2">Min</span>}</td>
                    <td className="td">
                      {dim.score === null ? <span className="text-muted">Cluster</span> : (
                        <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3">
                          <Meter value={dim.score} threshold={proof.threshold} emphasize={weakest} />
                          <span className="num text-right font-mono">{score(dim.score)}</span>
                        </div>
                      )}
                    </td>
                    <td className="td">{dim.statement ? dim.statement.charAt(0).toUpperCase() + dim.statement.slice(1) : ''}</td>
                    <td className="td font-mono text-xs text-muted">{dim.rule}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Key Difference" id="variable">
          <div className="card px-6 py-6">
            <p className="text-lg font-bold">{dv.basis === 'MEASURED' ? variableName(dv.name) : 'None Found'}</p>
            {dv.basis === 'MEASURED' && (dv.a || dv.b) && (
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div><dt className="eyebrow">A</dt><dd className="num mt-1 font-mono">{dv.a ?? 'n/a'}</dd></div>
                <div><dt className="eyebrow">B</dt><dd className="num mt-1 font-mono">{dv.b ?? 'n/a'}</dd></div>
              </dl>
            )}
            {dv.basis === 'MEASURED' && dv.name.includes(',') && <p className="mt-3 text-sm text-muted">{titleCase(dv.name.replace(/^[^,]*,\s*/, '').replace(/^which accounts for part of the spread/, 'Partial Moderator'))}</p>}
            {dv.basis !== 'MEASURED' && <p className="mt-2 text-sm text-muted">No recorded covariate differs.</p>}
          </div>
        </Section>

        <Section title="Score" id="value" aside={<span className="font-mono">{score(d.diagnosticValue.value)}</span>}>
          <div className="card">
            {d.diagnosticValue.components.map((k) => (
              <div key={k.key} className="grid grid-cols-[minmax(0,5fr)_minmax(0,4fr)_64px] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <div className="truncate text-sm">{titleCase(k.label)}<span className="num ml-2 font-mono text-xs text-muted">×{k.weight.toFixed(2)}</span></div>
                <Meter value={k.value} />
                <div className="num text-right font-mono text-sm">{k.contribution >= 0 ? '+' : ''}{k.contribution.toFixed(3)}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Trials" id="trials">
        <div className="grid gap-4 lg:grid-cols-2">
          {d.parties.map((p) => (
            <div key={p.side} className="card px-6 py-6">
              <p className="eyebrow mb-3">Result {p.side}</p>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[96px_minmax(0,1fr)]">
                {p.trials.slice(0, 4).map((t) => (
                  <div key={t.nctId} className="contents">
                    <dt className="text-muted">Trial</dt>
                    <dd>
                      <Trial nctId={t.nctId} label={t.acronym} />
                      <span className="block">{t.title}</span>
                      <span className="block text-muted">{[phase(t.phase), t.enrollment ? `N ${n(t.enrollment)}` : null, t.sponsor, t.completionDate?.slice(0, 7)].filter(Boolean).join(' · ')}</span>
                      {t.status === 'TERMINATED' && <span className="chip chip-accent mt-1" title={t.whyStopped ?? undefined}>Terminated · {titleCase(t.stopCategory ?? 'Other')}</span>}
                    </dd>
                  </div>
                ))}
                {p.trials.length > 4 && <><dt className="text-muted">More</dt><dd className="num text-muted">+{p.trials.length - 4} Trials</dd></>}
                {p.record && (
                  <>
                    <dt className="text-muted">Outcome</dt>
                    <dd>{p.record.outcomeTitle}{p.record.classification ? ` [${p.record.classification}]` : ''}</dd>
                    <dt className="text-muted">Arms</dt>
                    <dd>{p.record.experimentalLabel} vs {p.record.comparatorLabel}</dd>
                    <dt className="text-muted">Follow-Up</dt>
                    <dd className="num">{followUp(p.record.timepointDays)}</dd>
                    <dt className="text-muted">Source</dt>
                    <dd>{p.record.sourceKind === 'ANALYSIS' ? 'Posted Analysis' : 'Arm-Level Data'} · {p.record.analysisPopulation} · N {n(p.record.nAnalyzed)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </Section>

      {cluster && (
        <Section
          title="Cluster"
          id="cluster"
          aside={
            <span className="flex flex-wrap items-center gap-2">
              <Count>{cluster.k} Trials</Count><Count>N {n(cluster.nPatients)}</Count>{pooled && <Count>I² {pct(pooled.i2)}</Count>}
              <Link className="link" href={`/map?endpoint=${c.endpoint.id}`}>Map</Link>
            </span>
          }
        >
          {clusterRows.length > 0 && <div className="card px-6 py-4"><Forest rows={clusterRows} measure={measure} unit={c.a.unit} /></div>}
          {cluster.stats.moderators.length > 0 && (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead><tr><th className="th">Moderator</th><th className="th text-right">Slope p</th><th className="th text-right">Residual I²</th><th className="th text-right">Q Explained</th></tr></thead>
                <tbody>
                  {cluster.stats.moderators.map((m) => (
                    <tr key={m.name}><td className="td">{variableName(m.name)}</td><td className="td num text-right font-mono">{pValue(m.p)}</td><td className="td num text-right font-mono">{pct(m.residualI2)}</td><td className="td num text-right font-mono">{pct(m.qExplained)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Prior Reviews" id="reviews">
        <div className="card px-6 py-4 text-sm">
          {d.alreadyResolved ? (
            <>
              <p className="font-medium">{d.alreadyResolved.coverage === 1 ? 'Covered' : 'Partly Covered'}{d.alreadyResolved.reviewStatus !== 'REVIEWED' && <span className="chip ml-2">Unverified Entry</span>}</p>
              <p className="mt-1 text-muted">{d.alreadyResolved.citation}{d.alreadyResolved.pmid ? ` PMID ${d.alreadyResolved.pmid}.` : ''}</p>
            </>
          ) : <p className="text-muted">None in Registry</p>}
        </div>
      </Section>

      <Section title="Provenance" id="provenance" aside={<Count>{c.factors.length} Steps</Count>}>
        <Provenance factors={c.factors} />
      </Section>

      <footer className="border-t border-border pt-4 text-xs text-muted">
        <p className="font-mono">{d.snapshot.aactVersion} · sha256 {d.snapshot.checksum.slice(0, 16)} · rules {d.ruleSet.version} · {d.ruleSet.rulesReviewed}/{d.ruleSet.rulesTotal} reviewed</p>
        <p className="mt-2">{d.grammarNote}</p>
      </footer>
    </article>
  );
}
