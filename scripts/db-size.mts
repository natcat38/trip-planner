/**
 * Trend check against Neon's 0.5 GB free-plan cap (handoff §3.2): run
 * `npm run db:size` with DATABASE_URL pointed at whichever database you
 * want measured — the local container by default, or Neon for the real one.
 * ponytail: pg_database_size is an approximation — Neon bills on its own
 * "logical data size" metric; the Neon console is the authoritative number.
 * @packageDocumentation
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { requireEnv } from '../src/lib/env';

const adapter = new PrismaPg({ connectionString: requireEnv('DATABASE_URL') });
const db = new PrismaClient({ adapter });

try {
  const [row] = await db.$queryRaw<
    { bytes: bigint }[]
  >`SELECT pg_database_size(current_database()) AS bytes`;
  const mb = Number(row.bytes) / (1024 * 1024);
  const pct = ((mb / 512) * 100).toFixed(1);
  console.log(
    `${mb.toFixed(1)} MB (~${pct}% of Neon's 0.5 GB free cap — approximate; Neon console is authoritative)`,
  );
  if (mb > 384)
    console.warn(
      'WARNING: past 75% — plan the Vercel Blob migration (ADR-0016 §1) before the wall.',
    );
} finally {
  await db.$disconnect();
}
