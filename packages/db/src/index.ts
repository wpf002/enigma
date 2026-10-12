import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export type * from '@prisma/client';

let client: PrismaClient | undefined;

/** Process-wide client. Prisma opens its own pool, so one instance per process. */
export function getDb(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export const RAW_TABLES = ['raw_study', 'raw_outcome_measure', 'raw_outcome_analysis'] as const;
