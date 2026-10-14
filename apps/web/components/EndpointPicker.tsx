'use client';

import { useRouter } from 'next/navigation';

export interface PickerGroup { label: string; options: { id: string; label: string }[] }

/** Endpoint select that moves to that endpoint's timeline. Drug and measure reset with it. */
export function EndpointPicker({ groups, value }: { groups: PickerGroup[]; value: string }) {
  const router = useRouter();
  return (
    <select className="field max-w-full" aria-label="Endpoint" value={value} onChange={(e) => router.push(`/endpoints/${e.target.value}`)}>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
