// Applies supabase/migrations to the Supabase database, using the connection
// from scripts/db-url.mjs, so the password is never typed or printed.
//
//   npm run db:push -- --dry-run   # list what would be applied, change nothing
//   npm run db:push                # apply (asks the Supabase CLI to confirm with --yes)
//
// Tip: rehearse risky migrations first by running them inside
// `begin; ... rollback;` on the database (see the Obsidian notes).
import { spawnSync } from 'node:child_process';

import { dbConnection, mask } from './db-url.mjs';

const { url, secret } = dbConnection();
const dryRun = process.argv.includes('--dry-run');
const args = ['supabase', 'db', 'push', '--db-url', url, dryRun ? '--dry-run' : '--yes'];

const r = spawnSync('npx', args, {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 20 * 1024 * 1024,
});
process.stdout.write(mask(r.stdout, secret));
process.stderr.write(mask(r.stderr, secret));
process.exit(r.status ?? 1);
