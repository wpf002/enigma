import { PageHeader } from '@/components/ui';
import { Watchlists } from '@/components/Watchlists';
import { api } from '@/lib/api';
import type { EndpointRow } from '@/lib/types';

export const metadata = { title: 'Watchlists' };

interface Agent { id: string; label: string }

export default async function WatchlistsPage() {
  const [endpoints, contradictions] = await Promise.all([
    api<EndpointRow[]>('/v1/endpoints'),
    api<{ items: { agents: Agent[] }[] }>('/v1/contradictions?pageSize=100'),
  ]);
  const agents = new Map<string, Agent>();
  for (const c of contradictions.items) for (const a of c.agents) if (!a.id.startsWith('?')) agents.set(a.id, a);
  return (
    <>
      <PageHeader eyebrow="Alerts on new snapshots" title="Watchlists">
        Watch an endpoint, an agent or a trial. When a newer AACT snapshot is ingested, Enigma compares it with the previous one and raises an
        alert for each trial that posted or changed results, and for each contradiction that was not there before.
      </PageHeader>
      <Watchlists
        endpoints={endpoints.filter((e) => !e.abstract && e.records > 0).map((e) => ({ id: e.id, label: e.label }))}
        agents={[...agents.values()].sort((a, b) => a.label.localeCompare(b.label))}
      />
    </>
  );
}
