// Builds the Supabase database connection string for the scripts in this
// folder, without the password ever being typed on the command line (where
// it would end up in your shell history) or printed.
//
// It uses, in order:
//   1. SUPABASE_DB_URL, if set in the environment (e.g. in CI);
//   2. otherwise EXPO_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD from .env.
//
// SUPABASE_DB_PASSWORD must NOT start with EXPO_PUBLIC_: anything with that
// prefix is built into the app, where anyone can read it.
import { existsSync, readFileSync } from 'node:fs';

/** The session pooler for this project's region (eu-west-1). Override with SUPABASE_DB_HOST. */
const DEFAULT_HOST = 'aws-1-eu-west-1.pooler.supabase.com';

function readDotEnv(path = '.env') {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

/** Returns { url, secret } where secret is the password (or full URL) to mask in any output. */
export function dbConnection() {
  if (process.env.SUPABASE_DB_URL) {
    return { url: process.env.SUPABASE_DB_URL, secret: process.env.SUPABASE_DB_URL };
  }
  const env = { ...readDotEnv(), ...process.env };
  const password = env.SUPABASE_DB_PASSWORD;
  if (!env.EXPO_PUBLIC_SUPABASE_URL || !password) {
    console.error(
      'No database connection. Add SUPABASE_DB_PASSWORD (Supabase → Project Settings → Database) to .env,\n' +
        'next to EXPO_PUBLIC_SUPABASE_URL, or set SUPABASE_DB_URL. Never prefix the password with EXPO_PUBLIC_.',
    );
    process.exit(2);
  }
  const ref = new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const host = env.SUPABASE_DB_HOST || DEFAULT_HOST;
  const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
  return { url, secret: password };
}

/** Replace the password (raw and URL-encoded) with **** in some text. */
export function mask(text, secret) {
  if (!text || !secret) return text ?? '';
  return text.split(secret).join('****').split(encodeURIComponent(secret)).join('****');
}
