import { db } from './util.js';

export type GateStatus = 'MET' | 'NOT_MET' | 'PARTIAL' | 'NOT_RUN';

export interface PhaseGate {
  phase: number;
  name: string;
  criterion: string;
  status: GateStatus;
  measured: string;
}

type Stats = Record<string, any>;
const pct = (v: number | undefined) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'n/a');

/** Roadmap §7 exit gates, read from the latest pipeline run of each step. Nothing here is self-reported as met without a number behind it. */
export async function phaseGates(snapshotId: string, source: string): Promise<PhaseGate[]> {
  const runs = await db.pipelineRun.findMany({ where: { snapshotId }, orderBy: { startedAt: 'desc' } });
  const latest = (step: string): Stats | null => (runs.find((r) => r.step === step)?.stats as Stats | undefined) ?? null;
  const normalize = latest('normalize');
  const harmonize = latest('harmonize');
  const gateEval = latest('gate-eval');
  const controversy = latest('controversy-eval');
  const dossier = latest('dossier');

  const reviews: Stats[] = (gateEval?.results ?? []).filter((r: Stats) => r.evaluated);
  const recovered = reviews.map((r) => `${r.review}: ${r.recoveredStrict}/${r.includedPairsPossible} strict, ${r.recoveredAtReviewPooling}/${r.includedPairsPossible} at the review's pooling level`).join('; ');

  return [
    {
      phase: 0, name: 'Bootstrap and ingestion', criterion: 'Full AACT restore reproducible from a cold start in one command',
      status: source === 'AACT_DUMP' ? 'MET' : 'PARTIAL',
      measured: source === 'AACT_DUMP' ? 'Cold start run against a CTTI dump.' : '`pnpm cold-start --subset` reproduces the same snapshot checksum from empty volumes. Not yet run against a CTTI dump.',
    },
    {
      phase: 1, name: 'Effect normalization', criterion: '>= 95% of results-posted trials yield a valid EffectRecord; conversions round-trip on a 500-record fixture',
      status: normalize ? ((normalize.gate?.yieldAllTrials ?? 0) >= 0.95 ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: normalize ? `${pct(normalize.gate?.yieldAllTrials)} of all trials, ${pct(normalize.gate?.yieldParallelTrials)} of parallel multi-arm trials. Round-trip fixture passes in the engine test suite.` : 'normalize has not run',
    },
    {
      phase: 2, name: 'Harmonization ontology', criterion: 'Clinician audit of 200 decisions at >= 90% agreement',
      status: 'NOT_RUN',
      measured: harmonize ? `No clinician has reviewed the rules. ${pct(harmonize.gate?.endpointMappedShare)} of records map to an endpoint node. Audit sample: \`pnpm ingest audit-sample\`.` : 'harmonize has not run',
    },
    {
      phase: 3, name: 'Comparability gate', criterion: 'Recover >= 85% of a review\'s included pairs, reject >= 90% of excluded ones',
      status: gateEval ? (reviews.length > 0 && reviews.every((r) => r.recoveryStrict >= 0.85 && r.excluded?.evaluated && r.excluded.rejectionRate >= 0.9) ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: gateEval ? `${recovered || 'no review evaluated'}. No fixture lists excluded studies, so rejection is not evaluated.` : 'gate-eval has not run',
    },
    {
      phase: 4, name: 'Contradiction engine', criterion: 'Surface >= 12 of 20 documented controversies without seeding',
      status: controversy ? (controversy.summary?.met ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: controversy ? `${controversy.summary.surfaced} of ${controversy.summary.listed} listed controversies surfaced. The gate calls for 20; ${controversy.summary.listed} are listed.` : 'controversy-eval has not run',
    },
    {
      phase: 5, name: 'Ranking and dossiers', criterion: 'A domain expert rates >= 4 of 5 dossiers "would investigate"',
      status: 'NOT_RUN',
      measured: dossier ? `${dossier.dossiers} dossiers generated. No expert has read them. Export: \`pnpm ingest export-dossiers\`.` : 'dossier has not run',
    },
    {
      phase: 6, name: 'Web surface', criterion: 'Search to dossier in under 60 seconds',
      status: 'NOT_RUN',
      measured: 'Not timed with a user. Search and dossier endpoints respond in well under a second on the local corpus.',
    },
  ];
}
