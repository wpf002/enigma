import { Count, PageHeader, Section, Stat, StatStrip, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { n, titleCase } from '@/lib/format';
import type { Overview, PipelineResponse, RulesResponse } from '@/lib/types';

export const metadata = { title: 'Validation' };

const INVARIANTS = [
  ['Gate First', 'Contradiction step reads passed edges only. Engine rejects pairs under threshold.'],
  ['Failure Is a Product', 'Every failed pair is stored with reasons.'],
  ['Factor Chain', 'Record A, record B, gate, test, rank. In order, with inputs.'],
  ['Effect Structs', 'Measure, value, interval, SE, n and direction travel together.'],
  ['Direction at Ingest', 'Unresolved sign fails the gate.'],
  ['No Verdicts', 'Claim type has no verdict field. One renderer.'],
  ['Terminated Trials', 'Stop reasons classified and kept.'],
  ['Stats in Python', 'TypeScript computes no test.'],
  ['Snapshot-Versioned', 'Dossiers record snapshot and checksum. Raw tables reject writes.'],
  ['No LLM Records', 'Rules drafted with LLM help stay unreviewed until signed off.'],
];

const STEP_LABEL: Record<string, string> = {
  snapshot: 'Raw Layer', normalize: 'Normalize', harmonize: 'Harmonize', gate: 'Gate', 'gate-eval': 'Review Recovery',
  contradict: 'Contradict', 'controversy-eval': 'Controversy Check', rank: 'Rank', dossier: 'Dossiers', alerts: 'Alerts',
};

export default async function ValidationPage() {
  const [overview, pipeline, rules] = await Promise.all([api<Overview>('/v1/overview'), api<PipelineResponse>('/v1/pipeline'), api<RulesResponse>('/v1/rules')]);
  const met = pipeline.gates.filter((g) => g.status === 'MET').length;
  return (
    <>
      <PageHeader title="Validation" meta={<span className="font-mono">{overview.snapshot.aactVersion}</span>} />

      <StatStrip>
        <Stat label="Exit Gates Met" value={`${met}/${pipeline.gates.length}`} />
        <Stat label="Rules Reviewed" value={`${rules.review.reviewed}/${rules.review.total}`} />
        <Stat label="Rule Set" value={rules.version} />
        <Stat label="Source" value={<span className="font-sans">{overview.snapshot.source === 'AACT_DUMP' ? 'AACT Dump' : 'API Subset'}</span>} sub={`${n(overview.snapshot.studyCount)} Trials`} />
      </StatStrip>

      <Section title="Exit Gates">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead><tr><th className="th w-12">#</th><th className="th w-48">Phase</th><th className="th">Criterion</th><th className="th w-28">Status</th><th className="th">Measured</th></tr></thead>
            <tbody>
              {pipeline.gates.map((g) => (
                <tr key={g.phase}>
                  <td className="td num font-mono text-muted">{g.phase}</td>
                  <td className="td font-medium">{g.name}</td>
                  <td className="td text-muted">{g.criterion}</td>
                  <td className="td"><StatusBadge status={g.status} /></td>
                  <td className="td">{g.measured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Invariants" aside={<Count>{INVARIANTS.length}</Count>}>
          <div className="card">
            {INVARIANTS.map(([name, how], i) => (
              <div key={name} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                <span className="num font-mono text-muted">{i + 1}</span>
                <span><span className="font-medium">{name}</span><span className="block text-muted">{how}</span></span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Pipeline">
          <div className="card overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Step</th><th className="th">Finished</th></tr></thead>
              <tbody>
                {pipeline.runs.map((r) => (
                  <tr key={r.step}>
                    <td className="td font-medium">{STEP_LABEL[r.step] ?? titleCase(r.step)}</td>
                    <td className="td num font-mono text-muted">{r.finishedAt ? new Date(r.finishedAt).toISOString().replace('T', ' ').slice(0, 16) : 'Running'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title="Rules" aside={<Count>{rules.review.total}</Count>}>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead><tr><th className="th w-40">Kind</th><th className="th w-72">Rule</th><th className="th">Description</th></tr></thead>
            <tbody>
              {rules.rules.map((r) => (
                <tr key={r.id}>
                  <td className="td text-muted">{titleCase(r.kind)}</td>
                  <td className="td break-all font-mono text-xs">{r.id}</td>
                  <td className="td text-muted">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
