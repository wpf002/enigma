// Phase 5: one dossier per contradiction. The claim, the comparability proof,
// the named discriminating variable, cluster context and the snapshot it was
// computed against. The provenance chain stays on the Contradiction row.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  CONTRADICTION_LABEL, DIMENSION_LABEL, formatEffect, GATE_DIMENSIONS, renderClaim, renderDiscriminator,
  type Claim, type ContradictionType, type GateDimension,
} from '@enigma/core';
import { getDb, type Prisma } from '@enigma/db';
import { ENDPOINT_BY_ID, endpointPath, ruleRegistry } from '@enigma/harmonize';
import { renderChain, type Factor } from '@enigma/provenance';
import { chunk, createLogger, loadConfig, type EnigmaConfig } from '@enigma/shared';
import { clearDerived, recordRun } from '../context.js';

const log = createLogger('dossier');

const WEIGHTS: [string, string, number][] = [
  ['gateConfidence', 'Gate confidence', 0.3],
  ['severity', 'Severity', 0.25],
  ['clusterWeight', 'Cluster weight', 0.2],
  ['unexplainedResidual', 'Unexplained residual', 0.15],
  ['discriminability', 'Discriminability', 0.1],
  ['alreadyResolved', 'Already resolved', -0.3],
];

export const GRAMMAR_NOTE =
  'Enigma states that two results cannot both hold under the stated conditions. It does not state which result is correct and it makes no clinical recommendation.';

type Trial = Prisma.TrialGetPayload<object>;
type Rec = Prisma.EffectRecordGetPayload<object>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function trialCard(t: Trial | undefined, nctId: string) {
  return {
    nctId,
    title: t?.title ?? nctId,
    acronym: t?.acronym ?? null,
    status: t?.status ?? null,
    phase: t?.phase ?? null,
    enrollment: t?.enrollment ?? null,
    sponsor: t?.sponsor ?? null,
    sponsorClass: t?.sponsorClass ?? null,
    completionDate: iso(t?.completionDate),
    whyStopped: t?.whyStopped ?? null,
    stopCategory: t?.stopCategory ?? null,
  };
}

function recordCard(r: Rec | undefined) {
  if (!r) return null;
  return {
    id: r.id,
    outcomeTitle: r.outcomeTitle,
    classification: r.classification,
    outcomeType: r.outcomeType,
    timeFrame: r.timeFrame,
    timepointDays: r.timepointDays,
    units: r.units,
    sourceKind: r.sourceKind,
    experimentalLabel: r.experimentalLabel,
    comparatorLabel: r.comparatorLabel,
    doseDaily: r.doseDaily?.toNumber() ?? null,
    doseUnit: r.doseUnit,
    analysisPopulation: r.analysisPopulation,
    nAnalyzed: r.nAnalyzed,
    reported: { measure: r.measure, value: r.value.toNumber(), ciLow: r.ciLow?.toNumber() ?? null, ciHigh: r.ciHigh?.toNumber() ?? null },
  };
}

export async function runDossier(_config: EnigmaConfig, snapshotId: string): Promise<void> {
  const db = getDb();
  const startedAt = new Date();
  await clearDerived(snapshotId, 'dossier');
  const threshold = loadConfig().COMPARABILITY_GATE_THRESHOLD;

  const snapshot = await db.snapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const contradictions = await db.contradiction.findMany({ where: { snapshotId }, orderBy: { rank: 'asc' } });
  const trials = new Map((await db.trial.findMany({ where: { snapshotId } })).map((t) => [t.nctId, t]));
  const clusters = new Map((await db.cluster.findMany({ where: { snapshotId } })).map((c) => [c.id, c]));
  const reviews = new Map((await db.resolvedReview.findMany()).map((r) => [r.id, r]));
  const recordIds = [
    ...new Set([
      ...contradictions.flatMap((c) => [c.aId, c.bId]).filter((x): x is string => x !== null),
      ...[...clusters.values()].flatMap((c) => c.memberIds),
    ]),
  ];
  const records = new Map<string, Rec>();
  for (const part of chunk(recordIds, 5000)) {
    for (const r of await db.effectRecord.findMany({ where: { id: { in: part } } })) records.set(r.id, r);
  }
  const edgeIds = contradictions.map((c) => c.edgeId).filter((x): x is string => x !== null);
  const edges = new Map<string, Prisma.ComparabilityEdgeGetPayload<object>>();
  for (const part of chunk(edgeIds, 5000)) {
    for (const e of await db.comparabilityEdge.findMany({ where: { id: { in: part } } })) edges.set(e.id, e);
  }
  const review = ruleRegistry.reviewSummary();

  const rows: Prisma.DossierCreateManyInput[] = [];
  for (const c of contradictions) {
    const claim = c.claim as unknown as Claim;
    const sentence = renderClaim(claim);
    const type = c.type as ContradictionType;
    const node = ENDPOINT_BY_ID.get(c.endpointNodeId);
    const edge = c.edgeId ? edges.get(c.edgeId) : undefined;
    const cluster = c.clusterId ? clusters.get(c.clusterId) : undefined;
    const factors = c.factors as unknown as Factor[];
    const components = c.components as Record<string, number | null>;
    const resolved = c.alreadyResolvedRef ? reviews.get(c.alreadyResolvedRef) : undefined;

    const gateFactors = new Map(factors.filter((f) => f.stage === 'GATE').map((f) => [f.name.replace('gate.', ''), f]));
    const scores = (edge?.dimensionScores ?? {}) as Record<string, number>;
    const dimensions = GATE_DIMENSIONS.filter((d) => edge || claim.conditions.some((k) => k.dimension === d)).map((d: GateDimension) => ({
      dimension: d,
      label: DIMENSION_LABEL[d],
      score: scores[d] ?? null,
      statement: claim.conditions.find((k) => k.dimension === d)?.statement ?? null,
      rule: gateFactors.get(d)?.rule ?? null,
      note: gateFactors.get(d)?.note ?? null,
    }));
    const weakest = edge?.weakestDimension ?? null;

    const parties = [
      { side: 'A', party: claim.a, record: c.aId ? records.get(c.aId) : undefined },
      { side: 'B', party: claim.b, record: c.bId ? records.get(c.bId) : undefined },
    ].map(({ side, party, record }) => ({
      side,
      label: party.label,
      kind: party.kind,
      effect: party.effect,
      effectText: formatEffect(party.effect, party.unit),
      trials: party.nctIds.map((n) => trialCard(trials.get(n), n)),
      record: recordCard(record),
    }));

    const clusterContext = cluster
      ? {
          id: cluster.id,
          label: cluster.label,
          k: cluster.k,
          nPatients: cluster.nPatients,
          density: cluster.density.toNumber(),
          minGateScore: cluster.minGateScore.toNumber(),
          measure: cluster.measure,
          stats: cluster.stats,
          members: cluster.memberIds.map((id) => {
            const r = records.get(id);
            const t = r ? trials.get(r.nctId) : undefined;
            return r
              ? {
                  recordId: id, nctId: r.nctId, label: t?.acronym ?? r.nctId, completionDate: iso(t?.completionDate), status: t?.status ?? null,
                  measure: r.measure, value: r.value.toNumber(), ciLow: r.ciLow?.toNumber() ?? null, ciHigh: r.ciHigh?.toNumber() ?? null,
                  n: r.nAnalyzed, arm: r.experimentalLabel,
                }
              : null;
          }).filter((m) => m !== null),
        }
      : null;

    // The title is the endpoint. The type travels as its own field.
    const title = node?.label ?? c.endpointNodeId;
    const body = {
      sentence,
      claim,
      type,
      typeLabel: CONTRADICTION_LABEL[type],
      endpoint: { id: c.endpointNodeId, label: node?.label ?? c.endpointNodeId, path: endpointPath(c.endpointNodeId).map((id) => ({ id, label: ENDPOINT_BY_ID.get(id)?.label ?? id })) },
      snapshot: { id: snapshot.id, aactVersion: snapshot.aactVersion, source: snapshot.source, fetchedAt: snapshot.fetchedAt.toISOString(), checksum: snapshot.checksum },
      parties,
      comparabilityProof: { gateScore: c.gateConfidence.toNumber(), threshold, weakestDimension: weakest, dimensions },
      discriminatingVariable: claim.discriminatingVariable,
      diagnosticValue: {
        value: c.diagnosticValue.toNumber(),
        components: WEIGHTS.map(([key, label, weight]) => ({ key, label, weight, value: components[key] ?? 0, contribution: weight * (components[key] ?? 0) })),
        zDiff: components.zDiff ?? null,
        pDiff: components.pDiff ?? null,
        qDiff: components.qDiff ?? null,
      },
      severity: c.severity.toNumber(),
      clusterContext,
      alreadyResolved: resolved ? { id: resolved.id, citation: resolved.citation, pmid: resolved.pmid, conclusion: resolved.conclusion, coverage: components.alreadyResolved, reviewStatus: resolved.reviewStatus } : null,
      ruleSet: { version: `${ruleRegistry.version} + ${factors.find((f) => f.stage === 'CONTRADICTION' && f.ruleVersion.startsWith('engine'))?.ruleVersion ?? 'engine'}`, harmonization: ruleRegistry.version, rulesTotal: review.total, rulesReviewed: review.reviewed },
      grammarNote: GRAMMAR_NOTE,
    };

    // ---- Markdown
    const md: string[] = [];
    md.push(`# Dossier ${c.rank}`, '', `> ${sentence}`, '');
    md.push('| | |', '|---|---|');
    md.push(`| Endpoint | ${title} |`);
    md.push(`| Diagnostic value | ${c.diagnosticValue.toNumber().toFixed(2)} (rank ${c.rank} of ${contradictions.length}) |`);
    md.push(`| Type | ${type}, ${CONTRADICTION_LABEL[type]} |`);
    md.push(`| Severity | ${c.severity.toNumber().toFixed(2)} |`);
    md.push(`| Gate confidence | ${c.gateConfidence.toNumber().toFixed(2)}${weakest ? ` (weakest dimension: ${DIMENSION_LABEL[weakest as GateDimension]})` : ''} |`);
    md.push(`| Snapshot | ${snapshot.aactVersion} (${snapshot.source}), sha256 ${snapshot.checksum.slice(0, 16)} |`);
    md.push(`| Rule set | ${body.ruleSet.version}. ${review.reviewed} of ${review.total} harmonization rules clinician-reviewed |`, '');

    md.push('## The two results', '');
    for (const p of parties) {
      md.push(`### ${p.side}: ${p.label}`, '', `- Effect: **${p.effectText}**`);
      for (const t of p.trials) {
        const facts = [t.phase, t.status, t.enrollment ? `${t.enrollment} enrolled` : null, t.sponsor, t.completionDate ? `completed ${t.completionDate}` : null].filter(Boolean).join(', ');
        md.push(`- Trial: ${t.title} (${t.nctId}${facts ? `; ${facts}` : ''})`);
        if (t.status === 'TERMINATED') md.push(`- Terminated: ${t.stopCategory ?? 'OTHER'}${t.whyStopped ? `. Registry reason: "${t.whyStopped}"` : ''}`);
      }
      if (p.record) {
        md.push(`- Outcome: ${p.record.outcomeTitle}${p.record.classification ? ` [${p.record.classification}]` : ''}${p.record.timeFrame ? ` (${p.record.timeFrame})` : ''}`);
        md.push(`- Comparison: ${p.record.experimentalLabel} vs ${p.record.comparatorLabel}`);
        md.push(`- Source: ${p.record.sourceKind === 'ANALYSIS' ? 'posted analysis' : 'computed from posted arm-level data'}; analysis population ${p.record.analysisPopulation}`);
      }
      md.push('');
    }

    md.push('## Comparability proof', '');
    md.push(`Gate score ${c.gateConfidence.toNumber().toFixed(2)} is the minimum across dimensions. Threshold ${threshold.toFixed(2)}.`, '');
    md.push('| Dimension | Score | Condition | Rule |', '|---|---|---|---|');
    for (const d of dimensions) md.push(`| ${d.label} | ${d.score === null ? 'n/a' : d.score.toFixed(2)} | ${d.statement ?? ''} | ${d.rule ?? ''} |`);
    md.push('');

    md.push('## Discriminating variable', '', renderDiscriminator(claim.discriminatingVariable), '');

    md.push('## Diagnostic value', '', '| Component | Value | Weight | Contribution |', '|---|---|---|---|');
    for (const k of body.diagnosticValue.components) md.push(`| ${k.label} | ${k.value.toFixed(2)} | ${k.weight.toFixed(2)} | ${k.contribution.toFixed(3)} |`);
    md.push(`| **Total** | | | **${c.diagnosticValue.toNumber().toFixed(2)}** |`, '');
    if (components.zDiff !== null && components.zDiff !== undefined) {
      md.push(`Difference test: z = ${components.zDiff.toFixed(2)}, p = ${components.pDiff?.toExponential(2)}, q = ${components.qDiff?.toExponential(2)} (Benjamini-Hochberg across all gate-pass pairs).`, '');
    }

    if (clusterContext) {
      const pooled = (clusterContext.stats as { pooled?: Record<string, number> }).pooled;
      md.push('## Cluster context', '', `${clusterContext.label}. ${clusterContext.k} trials, ${clusterContext.nPatients} participants.`);
      if (pooled) md.push(`Heterogeneity: I2 = ${(pooled.i2! * 100).toFixed(0)}%, Q = ${pooled.q!.toFixed(1)} on ${pooled.df} df, tau2 = ${pooled.tau2!.toFixed(4)}.`);
      md.push('', '| Trial | Arm | Effect | N | Completed |', '|---|---|---|---|---|');
      for (const m of clusterContext.members) {
        md.push(`| ${m.label} (${m.nctId}) | ${m.arm ?? ''} | ${m.measure} ${m.value.toFixed(2)} (${m.ciLow?.toFixed(2)} to ${m.ciHigh?.toFixed(2)}) | ${m.n ?? ''} | ${m.completionDate ?? ''} |`);
      }
      md.push('');
    }

    md.push('## Already resolved?', '');
    md.push(resolved
      ? `${components.alreadyResolved === 1 ? 'Covered' : 'Partly covered'} by a published review (entry ${resolved.reviewStatus === 'REVIEWED' ? 'verified' : 'not yet verified against the source'}): ${resolved.citation}${resolved.pmid ? ` PMID ${resolved.pmid}.` : ''} ${resolved.conclusion}`
      : 'No review in the registry covers this conflict. The registry is small; absence here is not evidence that the conflict is new.', '');

    md.push('## Provenance chain', '', '```', ...renderChain(factors.map((f) => ({ ...f, name: f.subject ? `${f.subject}:${f.name}` : f.name }))), '```', '');
    md.push('---', '', GRAMMAR_NOTE, '');

    rows.push({
      contradictionId: c.id,
      snapshotId,
      rank: c.rank ?? 0,
      title,
      body: body as unknown as Prisma.InputJsonValue,
      markdown: md.join('\n'),
    });
  }

  for (const part of chunk(rows, 200)) await db.dossier.createMany({ data: part });
  const gate = { expertReview: 'NOT_RUN', needs: 'a domain expert rates five dossiers cold, >= 4 "would investigate"', export: 'pnpm ingest export-dossiers' };
  await recordRun(snapshotId, 'dossier', ruleRegistry.version, { dossiers: rows.length, gate }, startedAt);
  log.info('dossier complete', { dossiers: rows.length });
}

/** Writes the top-ranked dossiers as Markdown files for the Phase 5 expert read. */
export async function exportDossiers(snapshotId: string, top: number): Promise<string> {
  const db = getDb();
  const dossiers = await db.dossier.findMany({ where: { snapshotId }, orderBy: { rank: 'asc' }, take: top });
  const dir = fileURLToPath(new URL('../../../../fixtures/generated/dossiers/', import.meta.url));
  await mkdir(dir, { recursive: true });
  for (const d of dossiers) await writeFile(`${dir}dossier-${String(d.rank).padStart(3, '0')}.md`, d.markdown);
  log.info('dossiers exported', { dir, count: dossiers.length });
  return dir;
}
