'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Alert, Watchlist } from '@/lib/types';
import { IconX } from './icons';
import { Empty } from './ui';

const KIND_LABEL: Record<string, string> = { ENDPOINT: 'Endpoint', AGENT: 'Agent', TRIAL: 'Trial' };
const ALERT_LABEL: Record<string, string> = {
  TRIAL_ADDED: 'New results', TRIAL_CHANGED: 'Results changed', TRIAL_REMOVED: 'Left scope', NEW_CONTRADICTION: 'New contradiction',
};

interface Option { id: string; label: string }

export function Watchlists({ endpoints, agents }: { endpoints: Option[]; agents: Option[] }) {
  const router = useRouter();
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [kind, setKind] = useState<Watchlist['kind']>('ENDPOINT');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, a] = await Promise.all([api<Watchlist[]>('/v1/watchlists'), api<Alert[]>('/v1/alerts')]);
      setLists(l);
      setAlerts(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load watchlists.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setValue(''); }, [kind]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/v1/watchlists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, value: value.trim() }) });
      setValue('');
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await api(`/v1/watchlists/${id}`, { method: 'DELETE' }).catch(() => setError('Could not remove.'));
    await load();
    router.refresh();
  };
  const markRead = async () => {
    await api('/v1/alerts/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => setError('Could not update alerts.'));
    await load();
    router.refresh();
  };

  const options = kind === 'ENDPOINT' ? endpoints : agents;
  const unread = alerts?.filter((a) => !a.readAt).length ?? 0;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        <h2 className="mb-4 text-lg font-bold">Watching</h2>
        <form onSubmit={add} className="card mb-6 grid gap-4 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Watch a</span>
            <select className="field w-full" value={kind} onChange={(e) => setKind(e.target.value as Watchlist['kind'])}>
              <option value="ENDPOINT">Endpoint</option>
              <option value="AGENT">Agent</option>
              <option value="TRIAL">Trial</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{KIND_LABEL[kind]}</span>
            {kind === 'TRIAL' ? (
              <input className="field w-full font-mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="NCT01131676" pattern="[Nn][Cc][Tt]\d{8}" title="NCT followed by eight digits" required />
            ) : (
              <select className="field w-full" value={value} onChange={(e) => setValue(e.target.value)} required>
                <option value="">Choose</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
          </label>
          <button type="submit" className="btn btn-primary justify-center" disabled={busy || !value.trim()}>{busy ? 'Adding' : 'Add to watchlist'}</button>
          {error && <p className="text-sm text-critical" role="alert">{error}</p>}
        </form>

        {lists === null && !error && <div className="card h-24" aria-busy="true" />}
        {lists?.length === 0 && <Empty title="Nothing watched yet">Add an endpoint, an agent or a trial. Alerts appear when a later snapshot adds or changes a trial it covers, or produces a new contradiction.</Empty>}
        {lists && lists.length > 0 && (
          <ul className="card">
            {lists.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <span className="min-w-0 text-sm">
                  <span className="eyebrow block">{KIND_LABEL[w.kind]}</span>
                  <Link className="link block truncate font-medium" href={w.kind === 'ENDPOINT' ? `/endpoints/${w.value}` : w.kind === 'TRIAL' ? `/trials/${w.value}` : `/contradictions?agent=${w.value}`}>{w.label}</Link>
                </span>
                <span className="flex items-center gap-3">
                  {w.unread > 0 && <span className="num rounded-full bg-accent px-2 text-xs font-medium text-accent-fg">{w.unread}</span>}
                  <button type="button" className="btn border-transparent" onClick={() => remove(w.id)} aria-label={`Stop watching ${w.label}`}><IconX /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold">Alerts</h2>
          {unread > 0 && <button type="button" className="btn" onClick={markRead}>Mark {unread} read</button>}
        </div>
        {alerts === null && !error && <div className="card h-24" aria-busy="true" />}
        {alerts?.length === 0 && (
          <Empty title="No alerts">
            Alerts compare a snapshot with the one before it. This store holds one snapshot, so there is nothing to compare yet. Ingest a newer
            snapshot and run <span className="font-mono">pnpm ingest pipeline</span>.
          </Empty>
        )}
        {alerts && alerts.length > 0 && (
          <ul className="card">
            {alerts.map((a) => {
              const href = a.detail.contradictionId ? `/contradictions/${a.detail.contradictionId}` : a.detail.nctId ? `/trials/${a.detail.nctId}` : '#';
              return (
                <li key={a.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className={`chip ${a.readAt ? '' : 'chip-accent'}`}>{ALERT_LABEL[a.kind] ?? a.kind}</span>
                    <span>{a.watchlist.name}</span>
                    <span className="font-mono">{a.snapshot}</span>
                  </p>
                  <Link href={href} className={`link text-sm ${a.readAt ? '' : 'font-medium'}`}>{a.title}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
