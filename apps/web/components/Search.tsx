'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { SearchResponse } from '@/lib/types';
import { IconSearch } from './icons';

interface Hit { key: string; group: string; label: string; sub: string; href: string }

function flatten(r: SearchResponse): Hit[] {
  return [
    ...r.contradictions.map((c) => ({ key: `c${c.id}`, group: 'Contradictions', label: `${c.type} · ${c.endpoint.label}`, sub: `${c.a.label} / ${c.b.label}`, href: `/contradictions/${c.id}` })),
    ...r.trials.map((t) => ({ key: `t${t.nctId}`, group: 'Trials', label: t.acronym ? `${t.acronym} · ${t.nctId}` : t.nctId, sub: t.title, href: `/trials/${t.nctId}` })),
    ...r.endpoints.map((e) => ({ key: `e${e.id}`, group: 'Endpoints', label: e.label, sub: 'Evidence timeline', href: `/endpoints/${e.id}` })),
    ...r.agents.map((a) => ({ key: `a${a.id}`, group: 'Agents', label: a.label, sub: 'Contradictions for this agent', href: `/contradictions?agent=${a.id}` })),
  ];
}

/** Search across trials, endpoints, agents and dossiers. Opens with / or Cmd-K. */
export function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
    else setQuery('');
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setState('idle');
      return;
    }
    setState('loading');
    const timer = setTimeout(() => {
      api<SearchResponse>(`/v1/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          setHits(flatten(r));
          setActive(0);
          setState('idle');
        })
        .catch(() => setState('error'));
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="field flex w-full items-center justify-between gap-2 text-muted">
        <span className="flex items-center gap-2">
          <IconSearch />
          Search
        </span>
        <kbd className="rounded-sm border border-border px-1 font-mono text-xs">/</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-24" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="card w-full max-w-prose shadow-float" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <IconSearch className="text-muted" />
              <input
                ref={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter') go(hits[active]);
                }}
                placeholder="Trial, NCT id, agent, endpoint"
                aria-label="Search query"
                className="w-full bg-transparent text-base outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {state === 'error' && <p className="px-3 py-4 text-sm text-muted">Search failed. The API did not answer.</p>}
              {state !== 'error' && query.trim().length < 2 && <p className="px-3 py-4 text-sm text-muted">Type two or more characters.</p>}
              {state === 'loading' && hits.length === 0 && <p className="px-3 py-4 text-sm text-muted">Searching.</p>}
              {state === 'idle' && query.trim().length >= 2 && hits.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nothing matches “{query.trim()}”.</p>}
              {hits.map((hit, i) => (
                <div key={hit.key}>
                  {(i === 0 || hits[i - 1]!.group !== hit.group) && <p className="eyebrow px-3 pb-1 pt-3">{hit.group}</p>}
                  <button
                    type="button"
                    onClick={() => go(hit)}
                    onMouseEnter={() => setActive(i)}
                    className={`block w-full rounded-sm px-3 py-2 text-left ${i === active ? 'bg-sunken' : ''}`}
                  >
                    <span className="block truncate text-sm font-medium">{hit.label}</span>
                    <span className="block truncate text-xs text-muted">{hit.sub}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
