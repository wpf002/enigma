import { PageHeader, Section, Stat, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { n } from '@/lib/format';
import type { Overview, PipelineResponse, RulesResponse } from '@/lib/types';

export const metadata = { title: 'Gates and rules' };

const INVARIANTS = [
  ['Gate first, always', 'The contradiction step reads only edges with passed = true, and the engine refuses any pair under threshold.'],
  ['Comparability failure is a product', 'Every failed pair is a stored record with its reasons, listed under Not comparable.'],
  ['Every contradiction carries a Factor chain', 'Record A, record B, the gate, the test and the ranking, in order, with input values.'],
  ['Effect sizes are structs', 'Measure, value, interval, SE, n and direction convention travel together. No bare number is stored.'],
  ['Direction is resolved at ingest', 'A sign that cannot be established leaves the record unresolved, and it fails the gate.'],
  ['Never says a result is wrong', 'The claim type has no verdict field. The sentence comes from one renderer.'],
  ['Terminated trials are first-class', 'Stop reasons are classified and kept. Termination is a candidate discriminating variable.'],
  ['Statistics live in the Python engine', 'TypeScript reads rows, blocks pairs and writes results. It computes no test.'],
  ['Snapshot-versioned', 'Every dossier records the snapshot id and checksum. Raw tables reject UPDATE, DELETE and TRUNCATE.'],
  ['No LLM output in the claim store', 'Rules were drafted with LLM help and are marked unreviewed until a clinician signs them off.'],
];

const STEP_LABEL: Record<string, string> = {
  snapshot: 'Raw layer', normalize: 'Effect normalization', harmonize: 'Harmonization', gate: 'Comparability gate', 'gate-eval': 'Review recovery',
  contradict: 'Contradiction engine', 'controversy-eval': 'Controversy check', rank: 'Ranking', dossier: 'Dossiers', alerts: 'Alerts',
};

export default async function StatusPage() {
  const [overview, pipeline, rules] = await Promise.all([api<Overview>('/v1/overview'), api<PipelineResponse>('/v1/pipeline'), api<RulesResponse>('/v1/rules')]);
  const kinds = [...new Set(rules.rules.map((r) => r.kind))];
  const met = pipeline.gates.filter((g) => g.status === 'MET').length;
  return (
    <>
      <PageHeader eyebrow="What has and has not been validated" title="Gates and rules">
        The roadmap sets an exit gate for each phase. This page reports each one from pipeline output. A gate that needs a clinician or a domain
        expert is shown as not run.
      </PageHeader>

      <section className="mb-16 grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Exit gates met" value={`${met} of ${pipeline.gates.length}`} note="see each row below" />
        <Stat label="Rules reviewed" value={`${rules.review.reviewed} of ${rules.review.total}`} note="by a clinician" />
        <Stat label="Rule set" value={<span className="font-mono text-lg">{rules.version}</span>} note="stamped on every derived record" />
        <Stat label="Snapshot" value={n(overview.snapshot.studyCount)} note={overview.snapshot.source === 'AACT_DUMP' ? 'trials, AACT dump' : 'trials, API subset'} />
      </section>

      <Section title="Roadmap exit gates">
        <div className="card">
          {pipeline.gates.map((g) => (
            <div key={g.phase} className="grid gap-4 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[48px_minmax(0,2fr)_112px_minmax(0,3fr)]">
              <div className="num font-mono text-sm text-muted">{g.phase}</div>
              <div className="text-sm"><p className="font-medium">{g.name}</p><p className="text-muted">{g.criterion}</p></div>
              <div><StatusBadge status={g.status} /></div>
              <p className="text-sm">{g.measured}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Locked invariants" aside="how each is enforced in this build">
        <ol className="card">
          {INVARIANTS.map(([name, how], i) => (
            <li key={name} className="grid gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0 md:grid-cols-[32px_minmax(0,2fr)_minmax(0,3fr)]">
              <span className="num font-mono text-muted">{i + 1}</span>
              <span className="font-medium">{name}</span>
              <span className="text-muted">{how}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Last pipeline run" aside={<span className="font-mono">{overview.snapshot.aactVersion}</span>}>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr><th className="th w-56">Step</th><th className="th w-48">Finished</th><th className="th">Rule version</th></tr></thead>
            <tbody>
              {pipeline.runs.map((r) => (
                <tr key={r.step}>
                  <td className="td font-medium">{STEP_LABEL[r.step] ?? r.step}</td>
                  <td className="td num font-mono text-muted">{r.finishedAt ? new Date(r.finishedAt).toISOString().replace('T', ' ').slice(0, 16) : 'running'}</td>
                  <td className="td font-mono text-xs text-muted">{r.ruleVersion ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rule registry" aside={`${rules.review.total} rules, none clinician-reviewed`}>
        <div className="flex flex-col gap-6">
          {kinds.map((kind) => (
            <div key={kind}>
              <p className="eyebrow mb-2">{kind.toLowerCase().replace(/_/g, ' ')}</p>
              <div className="card">
                {rules.rules.filter((r) => r.kind === kind).map((r) => (
                  <div key={r.id} className="grid gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
                    <span className="break-all font-mono text-xs">{r.id}</span>
                    <span className="text-muted">{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
