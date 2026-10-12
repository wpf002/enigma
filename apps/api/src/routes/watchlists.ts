import type {} from '@fastify/sensible';
import { AGENT_BY_ID, ENDPOINT_BY_ID } from '@enigma/harmonize';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agentLabel, db, endpointLabel } from '../util.js';

const createBody = z.object({
  kind: z.enum(['ENDPOINT', 'AGENT', 'TRIAL']),
  value: z.string().min(1).max(80),
  name: z.string().max(120).optional(),
});

const display = (kind: string, value: string) => (kind === 'ENDPOINT' ? endpointLabel(value) : kind === 'AGENT' ? agentLabel(value) : value);

/** Watchlists and their alerts. These are the only tables the API writes. */
export async function watchlistRoutes(app: FastifyInstance) {
  app.get('/v1/watchlists', async () => {
    const lists = await db.watchlist.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { alerts: { where: { readAt: null } } } } } });
    return lists.map((w) => ({ id: w.id, name: w.name, kind: w.kind, value: w.value, label: display(w.kind, w.value), createdAt: w.createdAt, unread: w._count.alerts }));
  });

  app.post('/v1/watchlists', async (req, reply) => {
    const body = createBody.parse(req.body);
    const value = body.kind === 'TRIAL' ? body.value.toUpperCase() : body.value;
    if (body.kind === 'ENDPOINT' && !ENDPOINT_BY_ID.has(value)) return reply.badRequest(`unknown endpoint ${value}`);
    if (body.kind === 'AGENT' && !AGENT_BY_ID.has(value)) return reply.badRequest(`unknown agent ${value}`);
    if (body.kind === 'TRIAL' && !/^NCT\d{8}$/.test(value)) return reply.badRequest('trial must be an NCT id');
    const row = await db.watchlist.upsert({
      where: { kind_value: { kind: body.kind, value } },
      create: { kind: body.kind, value, name: body.name ?? display(body.kind, value) },
      update: {},
    });
    return reply.status(201).send({ id: row.id, name: row.name, kind: row.kind, value: row.value, label: display(row.kind, row.value), createdAt: row.createdAt, unread: 0 });
  });

  app.delete('/v1/watchlists/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.watchlist.deleteMany({ where: { id } });
    return reply.status(204).send();
  });

  app.get('/v1/alerts', async (req) => {
    const q = req.query as { unread?: string; watchlist?: string };
    const alerts = await db.alert.findMany({
      where: { ...(q.unread === 'true' ? { readAt: null } : {}), ...(q.watchlist ? { watchlistId: q.watchlist } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { watchlist: true, snapshot: { select: { aactVersion: true } } },
    });
    return alerts.map((a) => ({
      id: a.id, kind: a.kind, title: a.title, detail: a.detail, readAt: a.readAt, createdAt: a.createdAt, snapshot: a.snapshot.aactVersion,
      watchlist: { id: a.watchlist.id, name: a.watchlist.name, kind: a.watchlist.kind, value: a.watchlist.value },
    }));
  });

  app.post('/v1/alerts/read', async (req) => {
    const body = z.object({ ids: z.array(z.string()).optional() }).parse(req.body ?? {});
    const res = await db.alert.updateMany({ where: { readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) }, data: { readAt: new Date() } });
    return { marked: res.count };
  });
}
