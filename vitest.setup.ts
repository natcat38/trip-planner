import 'dotenv/config';

// ponytail: 11 parallel *.db.test.ts files each open their own pg Pool via
// src/lib/db.ts — cap each at 4 so 11 files x max can't exceed Postgres's
// default max_connections=100.
process.env.PG_POOL_MAX ??= '4';
