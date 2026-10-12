import { CONTRADICTION_LABEL, formatEffect, renderClaim, type Claim, type ContradictionType } from '@enigma/core';
import { getDb, type Prisma } from '@enigma/db';
import { AGENT_BY_ID, ENDPOINT_BY_ID } from '@enigma/harmonize';

export const db = getDb();

export const num = (d: { toNumber(): number } | null | undefined): number | null => (d === null || d === undefined ? null : d.toNumber());
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** Known agents by label. A sponsor code that is not in the dictionary is shown as the code. */
export const agentLabel = (id: string): string => AGENT_BY_ID.get(id)?.label ?? (id.startsWith('?') ? `${id.slice(1).toUpperCase()} (sponsor code)` : id);
export const endpointLabel = (id: string | null): string => (id ? (ENDPOINT_BY_ID.get(id)?.label ?? id) : 'unmapped');

/** Newest snapshot unless the request names one. */
export async function snapshotFor(query: { snapshot?: string | undefined }): Promise<Prisma.SnapshotGetPayload<object>> {
  const found = query.snapshot
    ? await db.snapshot.findFirst({ where: { OR: [{ id: query.snapshot }, { aactVersion: query.snapshot }] } })
    : await db.snapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!found) throw Object.assign(new Error('no snapshot ingested yet'), { statusCode: 404 });
  return found;
}

type ContradictionRow = Prisma.ContradictionGetPayload<object>;

export function contradictionSummary(c: ContradictionRow) {
  const claim = c.claim as unknown as Claim;
  const type = c.type as ContradictionType;
  const party = (p: Claim['a']) => ({ label: p.label, nctIds: p.nctIds, kind: p.kind, effect: p.effect, unit: p.unit ?? null, effectText: formatEffect(p.effect, p.unit) });
  return {
    id: c.id,
    rank: c.rank,
    type,
    typeLabel: CONTRADICTION_LABEL[type],
    endpoint: { id: c.endpointNodeId, label: endpointLabel(c.endpointNodeId) },
    agents: c.agents.map((id) => ({ id, label: agentLabel(id) })),
    nctIds: c.nctIds,
    sentence: renderClaim(claim),
    brief: renderClaim(claim, 'brief'),
    a: party(claim.a),
    b: party(claim.b),
    diagnosticValue: num(c.diagnosticValue),
    severity: num(c.severity),
    gateConfidence: num(c.gateConfidence),
    discriminatingVariable: claim.discriminatingVariable,
    alreadyResolvedRef: c.alreadyResolvedRef,
    clusterId: c.clusterId,
    edgeId: c.edgeId,
  };
}

export function effectOf(r: { measure: string; value: Prisma.Decimal; ciLow: Prisma.Decimal | null; ciHigh: Prisma.Decimal | null; ciLevel: Prisma.Decimal | null }) {
  const effect = { measure: r.measure as Claim['a']['effect']['measure'], value: r.value.toNumber(), ciLow: r.ciLow?.toNumber() ?? NaN, ciHigh: r.ciHigh?.toNumber() ?? NaN, ciLevel: r.ciLevel?.toNumber() ?? 0.95 };
  return { ...effect, text: formatEffect(effect) };
}
