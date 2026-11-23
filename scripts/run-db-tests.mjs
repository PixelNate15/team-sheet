// Runs the pgTAP tests in supabase/tests/database against a Supabase
// database without Docker (the Supabase CLI's `test db` needs Docker).
//
//   SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres" npm run test:db
//
// Each test file runs inside its own transaction and rolls back, so no test
// data is left behind.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL to the session pooler connection string (with your password).');
  process.exit(2);
}

const dir = 'supabase/tests/database';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let failures = 0;

for (const file of files) {
  console.log(`\n# ${file}`);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // A query without parameters may contain many statements; pg returns one result per statement.
    const results = [].concat(await client.query(readFileSync(join(dir, file), 'utf8')));
    for (const r of results) {
      for (const row of r.rows ?? []) {
        for (const v of Object.values(row)) {
          if (typeof v === 'string' && /^(ok|not ok|#|1\.\.)/.test(v)) {
            console.log(v);
            if (v.startsWith('not ok')) failures++;
          }
        }
      }
    }
  } catch (e) {
    console.log(`not ok - ${file} stopped with an error: ${e.message}`);
    failures++;
  } finally {
    await client.end(); // an unfinished transaction is rolled back when the connection closes
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll database tests passed');
process.exit(failures ? 1 : 0);
