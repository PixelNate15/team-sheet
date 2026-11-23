/** Turn Supabase / Postgres / network errors into a sentence a player can act on. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  const msg =
    typeof e === 'string'
      ? e
      : typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Something went wrong.';

  if (/network request failed|fetch failed|failed to fetch/i.test(msg)) {
    return 'No connection. Check your internet and try again.';
  }
  if (/invalid login credentials/i.test(msg)) {
    return 'That email and password don’t match an account.';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Please confirm your email address first. Check your inbox for the link.';
  }
  if (/duplicate key value/i.test(msg)) {
    return 'That has already been saved.';
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Some details aren’t valid. Please check and try again.';
  }
  if (/row-level security/i.test(msg)) {
    return 'You don’t have permission to do that.';
  }
  return msg;
}
