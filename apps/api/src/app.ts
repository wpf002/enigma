import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { contradictionRoutes } from './routes/contradictions.js';
import { overviewRoutes } from './routes/overview.js';

/** Read API over the claim store. The only writes are watchlists and alert read state. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } });
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'DELETE'] });
  await app.register(sensible);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: 'invalid query', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: err.message });
  });

  app.get('/health', async () => ({ ok: true, service: 'enigma-api' }));
  await app.register(overviewRoutes);
  await app.register(contradictionRoutes);
  return app;
}
