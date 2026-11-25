// Runs a SQL file against the Supabase database:
//
//   node scripts/run-sql.mjs supabase/seed/test-data.sql
//
// Used by `npm run db:seed` / `npm run db:unseed`. The connection comes from
// scripts/db-url.mjs, so the password is never typed or printed.
import { readFileSync } from 'node:fs';
import pg from 'pg';

import { dbConnection, mask } from './db-url.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-sql.mjs <file.sql>');
  process.exit(1);
}

const { url, secret } = dbConnection();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
client.on('notice', (n) => console.log(n.message));

await client.connect();
try {
  await client.query(readFileSync(file, 'utf8'));
  console.log(`Done: ${file}`);
} catch (e) {
  console.error(`Failed (nothing was changed): ${mask(e.message, secret)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
