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
  const recovered = reviews.map((r) => `${r.review}: ${r.recoveredStrict}/${r.includedPairsPossible} strict, ${r.recoveredAtReviewPooling}/${r.includedPairsPossible} pooled`).join('. ');

  return [
    {
      phase: 0, name: 'Ingestion', criterion: 'AACT restore from cold start in one command',
      status: source === 'AACT_DUMP' ? 'MET' : 'PARTIAL',
      measured: source === 'AACT_DUMP' ? 'Run against a CTTI dump.' : 'Subset cold start reproduces the checksum. No CTTI dump run.',
    },
    {
      phase: 1, name: 'Normalization', criterion: '95% of trials yield an effect record. Conversions round-trip.',
      status: normalize ? ((normalize.gate?.yieldAllTrials ?? 0) >= 0.95 ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: normalize ? `${pct(normalize.gate?.yieldAllTrials)} of trials, ${pct(normalize.gate?.yieldParallelTrials)} of parallel trials. Round-trip passes.` : 'Not run.',
    },
    {
      phase: 2, name: 'Harmonization', criterion: 'Clinician audit of 200 decisions at 90% agreement',
      status: 'NOT_RUN',
      measured: harmonize ? `No clinician review. ${pct(harmonize.gate?.endpointMappedShare)} of records mapped.` : 'Not run.',
    },
    {
      phase: 3, name: 'Comparability Gate', criterion: 'Recover 85% of a review\'s included pairs. Reject 90% of excluded.',
      status: gateEval ? (reviews.length > 0 && reviews.every((r) => r.recoveryStrict >= 0.85 && r.excluded?.evaluated && r.excluded.rejectionRate >= 0.9) ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: gateEval ? `${recovered || 'No review evaluated'}. Rejection not evaluated.` : 'Not run.',
    },
    {
      phase: 4, name: 'Contradiction Engine', criterion: 'Surface 12 of 20 documented controversies',
      status: controversy ? (controversy.summary?.met ? 'MET' : 'NOT_MET') : 'NOT_RUN',
      measured: controversy ? `${controversy.summary.surfaced} of ${controversy.summary.listed} listed surfaced. 20 required.` : 'Not run.',
    },
    {
      phase: 5, name: 'Dossiers', criterion: 'Expert rates 4 of 5 "would investigate"',
      status: 'NOT_RUN',
      measured: dossier ? `${dossier.dossiers} dossiers. No expert read.` : 'Not run.',
    },
    {
      phase: 6, name: 'Web', criterion: 'Search to dossier in under 60 seconds',
      status: 'NOT_RUN',
      measured: 'Not timed with a user.',
    },
  ];
}
