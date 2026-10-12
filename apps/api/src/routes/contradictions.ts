import type { Prisma } from '@enigma/db';
import type {} from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderDossierPdf } from '../pdf.js';
import { contradictionSummary, db, snapshotFor } from '../util.js';

const listQuery = z.object({
  snapshot: z.string().optional(),
  type: z.string().optional(),
  endpoint: z.string().optional(),
  agent: z.string().optional(),
  trial: z.string().optional(),
  q: z.string().optional(),
  resolved: z.enum(['any', 'unresolved', 'resolved']).default('any'),
  discriminator: z.enum(['any', 'named', 'unidentified']).default('any'),
  sort: z.enum(['rank', 'severity', 'gate']).default('rank'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function contradictionRoutes(app: FastifyInstance) {
  app.get('/v1/contradictions', async (req) => {
    const q = listQuery.parse(req.query);
    const snapshot = await snapshotFor(q);
    const where: Prisma.ContradictionWhereInput = { snapshotId: snapshot.id };
    if (q.endpoint) where.endpointNodeId = { in: q.endpoint.split(',') };
    if (q.agent) where.agents = { has: q.agent };
    if (q.trial) where.nctIds = { has: q.trial.toUpperCase() };
    if (q.resolved === 'unresolved') where.alreadyResolvedRef = null;
    if (q.resolved === 'resolved') where.alreadyResolvedRef = { not: null };
    if (q.discriminator === 'named') where.discriminatingVariable = { not: null };
    if (q.discriminator === 'unidentified') where.discriminatingVariable = null;
    if (q.q) {
      const term = q.q.trim();
      where.OR = [
        { nctIds: { has: term.toUpperCase() } },
        { agents: { has: term.toLowerCase() } },
        { dossier: { is: { markdown: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    const orderBy: Prisma.ContradictionOrderByWithRelationInput[] =
      q.sort === 'severity' ? [{ severity: 'desc' }, { rank: 'asc' }] : q.sort === 'gate' ? [{ gateConfidence: 'desc' }, { rank: 'asc' }] : [{ rank: 'asc' }];
    // type facet counts ignore the type filter itself, so the UI can show every type's count
    const typed: Prisma.ContradictionWhereInput = q.type ? { ...where, type: { in: q.type.split(',') } } : where;
    const [total, items, facets] = await Promise.all([
      db.contradiction.count({ where: typed }),
      db.contradiction.findMany({ where: typed, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.contradiction.groupBy({ by: ['type'], where, _count: true }),
    ]);
    return {
      total, page: q.page, pageSize: q.pageSize,
      facets: { type: Object.fromEntries(facets.map((f) => [f.type, f._count])) },
      items: items.map(contradictionSummary),
    };
  });

  app.get('/v1/contradictions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await db.contradiction.findUnique({ where: { id }, include: { dossier: true } });
    if (!c) return reply.notFound('contradiction not found');
    const [prev, next] = await Promise.all([
      c.rank ? db.contradiction.findFirst({ where: { snapshotId: c.snapshotId, rank: c.rank - 1 }, select: { id: true } }) : null,
      c.rank ? db.contradiction.findFirst({ where: { snapshotId: c.snapshotId, rank: c.rank + 1 }, select: { id: true } }) : null,
    ]);
    return {
      ...contradictionSummary(c),
      components: c.components,
      factors: c.factors,
      dossier: c.dossier ? { id: c.dossier.id, title: c.dossier.title, body: c.dossier.body, createdAt: c.dossier.createdAt } : null,
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
    };
  });

  app.get('/v1/contradictions/:id/dossier.md', async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = await db.dossier.findUnique({ where: { contradictionId: id } });
    if (!d) return reply.notFound('dossier not found');
    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="enigma-dossier-${String(d.rank).padStart(3, '0')}.md"`)
      .send(d.markdown);
  });

  app.get('/v1/contradictions/:id/dossier.pdf', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await db.contradiction.findUnique({ where: { id }, include: { dossier: true } });
    if (!c?.dossier) return reply.notFound('dossier not found');
    const pdf = await renderDossierPdf(c.dossier, c.factors);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="enigma-dossier-${String(c.dossier.rank).padStart(3, '0')}.pdf"`)
      .send(pdf);
  });
}
