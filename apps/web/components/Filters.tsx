'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { IconSearch } from './icons';

export interface FilterSelect { name: string; label: string; options: { value: string; label: string }[] }

/** Selects that apply on change and a search box that applies on Enter. State lives in the URL. */
export function Filters({ selects, search }: { selects: FilterSelect[]; search?: { name: string; placeholder: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(search ? (params.get(search.name) ?? '') : '');

  const apply = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    router.push(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
  };

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      {search && (
        <form onSubmit={(e) => { e.preventDefault(); apply(search.name, q.trim()); }} className="field flex items-center gap-2 py-0">
          <IconSearch className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={search.placeholder} aria-label={search.placeholder} className="w-40 bg-transparent py-2 text-sm outline-none placeholder:text-muted" />
        </form>
      )}
      {selects.map((s) => (
        <select key={s.name} className="field max-w-full truncate" aria-label={s.label} value={params.get(s.name) ?? s.options[0]?.value ?? ''} onChange={(e) => apply(s.name, e.target.value)}>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}
