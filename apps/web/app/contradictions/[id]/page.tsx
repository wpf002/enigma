import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forest, type ForestRow } from '@/components/Forest';
import { IconBack, IconArrow, IconDownload } from '@/components/icons';
import { Provenance } from '@/components/Provenance';
import { Crumbs, Meter, PassFail, Section, Stat, Trial, TypeBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { followUp, isRatio, n, pct, pValue, score } from '@/lib/format';
import type { ContradictionDetail } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const c = await api<ContradictionDetail>(`/v1/contradictions/${params.id}`).catch(() => null);
  return { title: c ? `Dossier ${c.rank}: ${c.endpoint.label}` : 'Dossier' };
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

  const pair: ForestRow[] = [
    { key: 'a', label: `A  ${c.a.label}`, value: c.a.effect.value, ciLow: c.a.effect.ciLow, ciHigh: c.a.effect.ciHigh, kind: 'accent' },
    { key: 'b', label: `B  ${c.b.label}`, value: c.b.effect.value, ciLow: c.b.effect.ciLow, ciHigh: c.b.effect.ciHigh, kind: 'accent' },
  ];
  const clusterRows: ForestRow[] = cluster && cluster.measure === measure
    ? [
        ...cluster.members.map((m) => ({
          key: m.recordId, label: m.label === m.nctId ? m.nctId : `${m.label} · ${m.nctId}`, sub: `${m.arm ?? ''}${m.completionDate ? ` · completed ${m.completionDate.slice(0, 7)}` : ''}${m.status === 'TERMINATED' ? ' · terminated' : ''}`,
          value: m.value, ciLow: m.ciLow, ciHigh: m.ciHigh, href: `/trials/${m.nctId}`,
          kind: conflictTrials.has(m.nctId) ? ('accent' as const) : m.status === 'TERMINATED' ? ('hollow' as const) : undefined,
        })),
        ...(pooled ? [{ key: 'pooled', label: `Pooled, random effects (${pooled.k} trials)`, value: toNatural(pooled.thetaRandom), ciLow: toNatural(pooled.ciLow), ciHigh: toNatural(pooled.ciHigh), kind: 'pooled' as const }] : []),
      ]
    : [];

  return (
    <article>
      <Crumbs items={[{ label: 'Contradictions', href: '/contradictions' }, { label: `Dossier ${c.rank}` }]} />

      <header className="mb-12">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="eyebrow">Dossier {c.rank}</span>
          <TypeBadge type={c.type} label={c.typeLabel} />
          {c.agents.map((a) => <Link key={a.id} className="chip" href={`/contradictions?agent=${a.id}`}>{a.label}</Link>)}
        </div>
        <h1 className="text-xl font-bold">{c.endpoint.label}</h1>
        <p className="mt-6 max-w-prose text-lg">{d.sentence}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a className="btn btn-primary" href={`/api/v1/contradictions/${c.id}/dossier.pdf`}><IconDownload />PDF</a>
          <a className="btn" href={`/api/v1/contradictions/${c.id}/dossier.md`}><IconDownload />Markdown</a>
          <span className="mx-2 hidden h-6 w-px bg-border sm:block" />
          {c.prevId ? <Link className="btn" href={`/contradictions/${c.prevId}`}><IconBack />Previous</Link> : <span className="btn" aria-disabled="true"><IconBack />Previous</span>}
          {c.nextId ? <Link className="btn" href={`/contradictions/${c.nextId}`}>Next<IconArrow /></Link> : <span className="btn" aria-disabled="true">Next<IconArrow /></span>}
        </div>
      </header>

      <section className="mb-16 grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Diagnostic value" value={score(d.diagnosticValue.value)} note={`rank ${c.rank}`} />
        <Stat label="Severity" value={score(d.severity)} note={c.typeLabel} />
        <Stat label="Gate confidence" value={score(proof.gateScore)} note={`threshold ${score(proof.threshold)}`} />
        <Stat
          label="Difference test"
          value={d.diagnosticValue.zDiff === null ? 'cluster' : `z ${d.diagnosticValue.zDiff.toFixed(2)}`}
          note={d.diagnosticValue.qDiff === null ? 'heterogeneity across the cluster' : `q ${pValue(d.diagnosticValue.qDiff)} after FDR`}
        />
      </section>

      <Section title="The two results">
        <div className="card mb-6 p-6">
          <Forest rows={pair} measure={measure} unit={c.a.unit} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {d.parties.map((p) => (
            <div key={p.side} className="card p-6">
              <p className="eyebrow mb-2">Result {p.side}</p>
              <p className="num text-lg font-bold">{p.effectText}</p>
              <dl className="mt-4 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[112px_minmax(0,1fr)]">
                {p.trials.slice(0, 6).map((t) => (
                  <div key={t.nctId} className="contents">
                    <dt className="text-muted">Trial</dt>
                    <dd>
                      <Trial nctId={t.nctId} label={t.acronym} />
                      <span className="block">{t.title}</span>
                      <span className="block text-muted">
                        {[t.phase, t.enrollment ? `${n(t.enrollment)} enrolled` : null, t.sponsor, t.completionDate ? `completed ${t.completionDate}` : null].filter(Boolean).join(' · ')}
                      </span>
                      {t.status === 'TERMINATED' && (
                        <span className="mt-1 block"><span className="chip chip-accent">Terminated: {(t.stopCategory ?? 'other').toLowerCase()}</span>{t.whyStopped && <span className="ml-2 text-muted">“{t.whyStopped}”</span>}</span>
                      )}
                    </dd>
                  </div>
                ))}
                {p.trials.length > 6 && <><dt className="text-muted">More</dt><dd className="text-muted">{p.trials.length - 6} further trials in this pooled result</dd></>}
                {p.record && (
                  <>
                    <dt className="text-muted">Outcome</dt>
                    <dd>{p.record.outcomeTitle}{p.record.classification ? ` [${p.record.classification}]` : ''}</dd>
                    <dt className="text-muted">Comparison</dt>
                    <dd>{p.record.experimentalLabel} vs {p.record.comparatorLabel}</dd>
                    <dt className="text-muted">Follow-up</dt>
                    <dd>{followUp(p.record.timepointDays)}{p.record.timeFrame ? <span className="text-muted"> · {p.record.timeFrame}</span> : null}</dd>
                    <dt className="text-muted">Source</dt>
                    <dd>{p.record.sourceKind === 'ANALYSIS' ? 'Posted analysis' : 'Computed from posted arm-level data'} · {p.record.analysisPopulation} · n {n(p.record.nAnalyzed)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Comparability proof" aside={<PassFail pass>{`Gate score ${score(proof.gateScore)}, the minimum across dimensions`}</PassFail>}>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr><th className="th w-44">Dimension</th><th className="th w-48">Score</th><th className="th">Condition</th><th className="th w-64">Rule</th></tr>
            </thead>
            <tbody>
              {proof.dimensions.map((dim) => {
                const weakest = dim.dimension === proof.weakestDimension;
                return (
                  <tr key={dim.dimension}>
                    <td className="td font-medium">{dim.label}{weakest && <span className="chip chip-accent ml-2">minimum</span>}</td>
                    <td className="td">
                      {dim.score === null ? <span className="text-muted">cluster level</span> : (
                        <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3">
                          <Meter value={dim.score} threshold={proof.threshold} emphasize={weakest} />
                          <span className="num text-right font-mono">{score(dim.score)}</span>
                        </div>
                      )}
                    </td>
                    <td className="td">{dim.statement}</td>
                    <td className="td font-mono text-xs text-muted">{dim.rule}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">The vertical tick on each bar is the threshold, {score(proof.threshold)}. One dimension under it would have ended the comparison.</p>
      </Section>

      <div className="grid gap-12 lg:grid-cols-2">
        <Section title="Discriminating variable">
          <div className="card p-6">
            {dv.basis === 'MEASURED' ? (
              <>
                <p className="text-lg font-bold">{dv.name}</p>
                {(dv.a || dv.b) && (
                  <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="eyebrow">Result A</dt><dd className="num mt-1 text-base">{dv.a ?? 'not recorded'}</dd></div>
                    <div><dt className="eyebrow">Result B</dt><dd className="num mt-1 text-base">{dv.b ?? 'not recorded'}</dd></div>
                  </dl>
                )}
                <p className="mt-4 text-sm text-muted">The recorded covariate that differs most between the two. It is a candidate, not an established cause.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Unidentified</p>
                <p className="mt-2 text-sm text-muted">No recorded covariate differs between the two results. Whatever separates them is not in the registry record.</p>
              </>
            )}
          </div>
        </Section>

        <Section title="Diagnostic value">
          <div className="card">
            {d.diagnosticValue.components.map((k) => (
              <div key={k.key} className="grid grid-cols-[minmax(0,5fr)_minmax(0,4fr)_72px] items-center gap-4 border-b border-border px-4 py-3">
                <div className="text-sm">{k.label}<span className="num ml-2 text-muted">× {k.weight.toFixed(2)}</span></div>
                <Meter value={k.value} />
                <div className="num text-right font-mono text-sm">{k.contribution >= 0 ? '+' : ''}{k.contribution.toFixed(3)}</div>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-4 px-4 py-3">
              <div className="text-sm font-bold">Total</div>
              <div className="num text-right font-mono text-sm font-bold">{score(d.diagnosticValue.value)}</div>
            </div>
          </div>
        </Section>
      </div>

      {cluster && (
        <Section title="Cluster context" aside={<Link className="link" href={`/map?endpoint=${c.endpoint.id}`}>Open in map</Link>}>
          <p className="mb-4 max-w-prose text-sm text-muted">
            {cluster.label}. {cluster.k} trials, {n(cluster.nPatients)} participants, linked by gate-pass comparisons.
            {pooled && ` Heterogeneity I² ${pct(pooled.i2)}, Q ${pooled.q.toFixed(1)} on ${pooled.df} df.`} One arm per trial is shown, which may differ from the arm in the claim.
          </p>
          {clusterRows.length > 0 && <div className="card p-6"><Forest rows={clusterRows} measure={measure} unit={c.a.unit} /></div>}
          {cluster.stats.moderators.length > 0 && (
            <div className="card mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead><tr><th className="th">Moderator tested</th><th className="th text-right">Slope p</th><th className="th text-right">Residual I²</th><th className="th text-right">Q explained</th></tr></thead>
                <tbody>
                  {cluster.stats.moderators.map((m) => (
                    <tr key={m.name}><td className="td">{m.name}</td><td className="td num text-right font-mono">{pValue(m.p)}</td><td className="td num text-right font-mono">{pct(m.residualI2)}</td><td className="td num text-right font-mono">{pct(m.qExplained)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Already resolved?">
        <div className="card max-w-prose p-6 text-sm">
          {d.alreadyResolved ? (
            <>
              <p className="font-medium">{d.alreadyResolved.coverage === 1 ? 'Covered by a published review' : 'Partly covered by a published review'}</p>
              <p className="mt-2">{d.alreadyResolved.citation}{d.alreadyResolved.pmid ? ` PMID ${d.alreadyResolved.pmid}.` : ''}</p>
              <p className="mt-2 text-muted">{d.alreadyResolved.conclusion}</p>
              {d.alreadyResolved.reviewStatus !== 'REVIEWED' && <p className="mt-2 text-muted">This registry entry has not been checked against the source.</p>}
            </>
          ) : (
            <p>No review in the registry covers this conflict. The review registry is small, so absence here is not evidence that the conflict is new.</p>
          )}
        </div>
      </Section>

      <Section title="Provenance chain" id="provenance">
        <Provenance factors={c.factors} />
      </Section>

      <footer className="border-t border-border pt-6 text-sm text-muted">
        <p className="max-w-prose">{d.grammarNote}</p>
        <p className="mt-3 font-mono text-xs">
          snapshot {d.snapshot.aactVersion} · {d.snapshot.source} · sha256 {d.snapshot.checksum.slice(0, 16)} · rules {d.ruleSet.version} · {d.ruleSet.rulesReviewed}/{d.ruleSet.rulesTotal} clinician-reviewed
        </p>
      </footer>
    </article>
  );
}
