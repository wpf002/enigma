import { PageHeader, Section, Stat, StatStrip, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { n, titleCase } from '@/lib/format';
import type { Overview, PipelineResponse, RulesResponse } from '@/lib/types';

export const metadata = { title: 'Validation' };

const STEP_LABEL: Record<string, string> = {
  snapshot: 'Raw Layer', normalize: 'Normalize', harmonize: 'Harmonize', gate: 'Gate', 'gate-eval': 'Review Recovery',
  contradict: 'Contradict', 'controversy-eval': 'Controversy Check', rank: 'Rank', dossier: 'Dossiers', alerts: 'Alerts',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Running');

export default async function ValidationPage() {
  const [overview, pipeline, rules] = await Promise.all([api<Overview>('/v1/overview'), api<PipelineResponse>('/v1/pipeline'), api<RulesResponse>('/v1/rules')]);
  const met = pipeline.gates.filter((g) => g.status === 'MET').length;
  const kinds = [...rules.rules.reduce((m, r) => m.set(r.kind, (m.get(r.kind) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Validation" meta={<span className="font-mono text-xs">{overview.snapshot.aactVersion}</span>} />

      <StatStrip>
        <Stat label="Phases Met" value={`${met} of ${pipeline.gates.length}`} />
        <Stat label="Rules Reviewed" value={`${rules.review.reviewed} of ${rules.review.total}`} />
        <Stat label="Source" value={overview.snapshot.source === 'AACT_DUMP' ? 'AACT Dump' : 'API Subset'} sub={`${n(overview.snapshot.studyCount)} Trials`} />
      </StatStrip>

      <Section title="Phases">
        <ol className="card">
          {pipeline.gates.map((g) => (
            <li key={g.phase} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[24px_200px_minmax(0,1fr)_112px]" title={g.criterion}>
              <span className="num text-sm text-muted">{g.phase}</span>
              <span className="text-sm font-medium">{g.name}</span>
              <span className="hidden truncate text-sm text-muted md:block" title={g.measured}>{g.measured}</span>
              <StatusBadge status={g.status} />
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Rules" aside={<span className="font-mono text-xs">{rules.version}</span>}>
          <div className="card px-4 py-2">
            {kinds.map(([kind, count]) => (
              <div key={kind} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>{titleCase(kind)}</span>
                <span className="num text-muted">{count}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Last Run">
          <div className="card px-4 py-2">
            {pipeline.runs.map((r) => (
              <div key={r.step} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>{STEP_LABEL[r.step] ?? titleCase(r.step)}</span>
                <span className="num text-muted">{when(r.finishedAt)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <details className="border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          <span>All Rules</span><span className="num text-muted">{rules.review.total}</span>
        </summary>
        <ul className="card mt-4">
          {rules.rules.map((r) => (
            <li key={r.id} className="border-b border-border px-4 py-3 text-sm last:border-b-0">
              <p className="break-all font-mono text-xs">{r.id}</p>
              <p className="text-muted">{r.description}</p>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
