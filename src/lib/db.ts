import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { requireEnv } from './env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({
  connectionString: requireEnv('DATABASE_URL'),
  // ponytail: lets Vitest cap per-file pool size (11 parallel *.db.test.ts
  // files x max must stay under Postgres's max_connections); undefined
  // leaves the pg default (10) and prod behavior unchanged.
  max: process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : undefined,
});
export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
