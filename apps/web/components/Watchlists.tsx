'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Alert, Watchlist } from '@/lib/types';
import { IconX } from './icons';
import { Empty } from './ui';

const KIND_LABEL: Record<string, string> = { ENDPOINT: 'Endpoint', AGENT: 'Drug', TRIAL: 'Trial' };
const ALERT_LABEL: Record<string, string> = {
  TRIAL_ADDED: 'New Results', TRIAL_CHANGED: 'Results Changed', TRIAL_REMOVED: 'Left Scope', NEW_CONTRADICTION: 'New Contradiction',
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
      setError(err instanceof ApiError ? err.message : 'Load Failed');
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
      setError(err instanceof ApiError ? err.message : 'Add Failed');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await api(`/v1/watchlists/${id}`, { method: 'DELETE' }).catch(() => setError('Remove Failed'));
    await load();
    router.refresh();
  };
  const markRead = async () => {
    await api('/v1/alerts/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => setError('Update Failed'));
    await load();
    router.refresh();
  };

  const options = kind === 'ENDPOINT' ? endpoints : agents;
  const unread = alerts?.filter((a) => !a.readAt).length ?? 0;

  return (
    <div className="max-w-page">
      <form onSubmit={add} className="mb-12 flex flex-wrap items-center gap-2">
        <select className="field" aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as Watchlist['kind'])}>
          <option value="ENDPOINT">Endpoint</option>
          <option value="AGENT">Drug</option>
          <option value="TRIAL">Trial</option>
        </select>
        {kind === 'TRIAL' ? (
          <input className="field w-64 font-mono" aria-label="Trial" value={value} onChange={(e) => setValue(e.target.value)} placeholder="NCT01131676" pattern="[Nn][Cc][Tt]\d{8}" title="NCT followed by eight digits" required />
        ) : (
          <select className="field w-64 max-w-full" aria-label={KIND_LABEL[kind]} value={value} onChange={(e) => setValue(e.target.value)} required>
            <option value="">{`Choose ${KIND_LABEL[kind]}`}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>{busy ? 'Adding' : 'Watch'}</button>
        {error && <p className="w-full text-sm text-critical" role="alert">{error}</p>}
      </form>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <section className="mb-12 flex min-w-0 flex-col">
          <h2 className="display mb-3 text-lg">Watching</h2>
          {lists === null && !error && <div className="card flex-1" aria-busy="true" />}
          {lists?.length === 0 && <Empty title="Nothing Watched" />}
          {lists && lists.length > 0 && (
            <ul className="card flex-1">
              {lists.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-4 border-b border-border px-4 py-2 last:border-b-0">
                  <span className="min-w-0 text-sm">
                    <Link className="link truncate font-medium" href={w.kind === 'ENDPOINT' ? `/endpoints/${w.value}` : w.kind === 'TRIAL' ? `/trials/${w.value}` : `/contradictions?agent=${w.value}`}>{w.label}</Link>
                    <span className="ml-2 text-muted">{KIND_LABEL[w.kind]}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {w.unread > 0 && <span className="num rounded-full bg-accent px-2 text-xs font-medium text-accent-fg">{w.unread}</span>}
                    <button type="button" className="btn border-transparent bg-transparent px-2 text-muted" onClick={() => remove(w.id)} aria-label={`Remove ${w.label}`} title="Remove"><IconX /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-12 flex min-w-0 flex-col">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="display text-lg">Alerts</h2>
            {unread > 0 && <button type="button" className="link text-sm" onClick={markRead}>Mark All Read</button>}
          </div>
          {alerts === null && !error && <div className="card flex-1" aria-busy="true" />}
          {alerts?.length === 0 && <Empty title="No Alerts" />}
          {alerts && alerts.length > 0 && (
            <ul className="card flex-1">
              {alerts.map((a) => {
                const href = a.detail.contradictionId ? `/contradictions/${a.detail.contradictionId}` : a.detail.nctId ? `/trials/${a.detail.nctId}` : '#';
                return (
                  <li key={a.id} className="border-b border-border px-4 py-3 last:border-b-0">
                    <Link href={href} className={`link text-sm ${a.readAt ? '' : 'font-medium'}`}>{a.title}</Link>
                    <p className="text-xs text-muted">{ALERT_LABEL[a.kind] ?? a.kind} · {a.watchlist.name}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
