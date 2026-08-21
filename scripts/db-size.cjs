/* eslint-disable @typescript-eslint/no-require-imports */
// Trend check against Neon's 0.5 GB free-plan cap (handoff §3.2).
// ponytail: pg_database_size is an approximation — Neon bills on its own
// "logical data size" metric; the Neon console is the authoritative number.
require('dotenv/config');

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../src/generated/prisma/client');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

db.$queryRaw`SELECT pg_database_size(current_database()) AS bytes`
  .then(([row]) => {
    const mb = Number(row.bytes) / (1024 * 1024);
    const pct = ((mb / 512) * 100).toFixed(1);
    console.log(
      `${mb.toFixed(1)} MB (~${pct}% of Neon's 0.5 GB free cap — approximate; Neon console is authoritative)`,
    );
    if (mb > 384)
      console.warn(
        'WARNING: past 75% — plan the Vercel Blob migration (ADR-0016 §1) before the wall.',
      );
  })
  .finally(() => db.$disconnect());
