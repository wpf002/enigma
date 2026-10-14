import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import type { EndpointRow } from '@/lib/types';

export const metadata = { title: 'Timeline' };

/** Timeline opens on the endpoint with the most contradictions. */
export default async function EndpointsPage() {
  const rows = await api<EndpointRow[]>('/v1/endpoints');
  const first = [...rows].filter((r) => r.records > 0 && !r.abstract).sort((a, b) => b.contradictions - a.contradictions || b.records - a.records)[0];
  redirect(first ? `/endpoints/${first.id}` : '/');
}
