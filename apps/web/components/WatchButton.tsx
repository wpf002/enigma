'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Watchlist } from '@/lib/types';
import { IconBell, IconCheck } from './icons';

/** Adds or removes a watchlist entry. Alerts are raised when a new snapshot changes something it covers. */
export function WatchButton({ kind, value }: { kind: Watchlist['kind']; value: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<Watchlist | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<Watchlist[]>('/v1/watchlists')
      .then((lists) => setEntry(lists.find((w) => w.kind === kind && w.value === value) ?? null))
      .catch(() => setFailed(true));
  }, [kind, value]);

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if (entry) {
        await api(`/v1/watchlists/${entry.id}`, { method: 'DELETE' });
        setEntry(null);
      } else {
        setEntry(await api<Watchlist>('/v1/watchlists', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, value }) }));
      }
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" className="btn" onClick={toggle} disabled={busy || entry === undefined} aria-pressed={Boolean(entry)}>
        {entry ? <IconCheck /> : <IconBell />}
        {entry === undefined ? 'Watch' : busy ? 'Saving' : entry ? 'Watching' : 'Watch'}
      </button>
      {failed && <span className="text-sm text-critical" role="alert">Could not save</span>}
    </span>
  );
}
