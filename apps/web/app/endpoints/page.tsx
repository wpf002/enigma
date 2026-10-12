import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { n } from '@/lib/format';
import type { EndpointRow } from '@/lib/types';

export const metadata = { title: 'Evidence timeline' };

const FAMILY: Record<string, string> = {
  cv: 'Cardiovascular', renal: 'Renal', glycemic: 'Glycemic control', weight: 'Body weight', bp: 'Blood pressure', lipids: 'Lipids', hypoglycemia: 'Hypoglycemia',
};

export default async function EndpointsPage() {
  const rows = await api<EndpointRow[]>('/v1/endpoints');
  const families = [...new Set(rows.map((r) => r.family))];
  // depth-first order so children sit under their parent
  const ordered = (family: string) => {
    const inFamily = rows.filter((r) => r.family === family);
    const out: EndpointRow[] = [];
    const walk = (parent: string | null) => inFamily.filter((r) => r.parentId === parent).forEach((r) => { out.push(r); walk(r.id); });
    walk(null);
    return out;
  };
  return (
    <>
      <PageHeader eyebrow="Harmonized endpoint ontology" title="Evidence timeline">
        Pick an endpoint to see every trial comparison mapped to it over calendar time. Outcomes are mapped to a node, not matched as text:
        3-point and expanded MACE are separate nodes, and so are all-cause and cardiovascular mortality.
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="th">Endpoint</th><th className="th w-24 text-right">Trials</th><th className="th w-24 text-right">Records</th>
              <th className="th w-24 text-right">Clusters</th><th className="th w-32 text-right">Contradictions</th>
            </tr>
          </thead>
          {families.map((family) => (
            <tbody key={family}>
              <tr><td colSpan={5} className="bg-sunken px-3 py-2"><span className="eyebrow">{FAMILY[family] ?? family}</span></td></tr>
              {ordered(family).filter((r) => !(r.abstract && r.depth === 0)).map((r) => (
                <tr key={r.id} className={r.records > 0 ? 'row-link' : ''}>
                  <td className="td" style={{ paddingLeft: 12 + Math.max(0, r.depth - 1) * 24 }}>
                    {r.records > 0 ? <Link className="link font-medium" href={`/endpoints/${r.id}`}>{r.label}</Link> : <span className="text-muted">{r.label}</span>}
                    {r.abstract && <span className="chip ml-2">group</span>}
                  </td>
                  <td className="td num text-right font-mono">{r.trials ? n(r.trials) : ''}</td>
                  <td className="td num text-right font-mono">{r.records ? n(r.records) : ''}</td>
                  <td className="td num text-right font-mono">{r.clusters ? n(r.clusters) : ''}</td>
                  <td className="td num text-right font-mono font-medium">{r.contradictions ? n(r.contradictions) : ''}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
