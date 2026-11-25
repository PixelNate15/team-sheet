import type { LeagueRow } from './types';

/**
 * The league position of a team from the table, matched the same way the
 * database does when a table is saved (ignoring capitals and spaces at either end).
 * Your own team is never matched. Returns null when there's no match.
 */
export function leaguePositionFor(opponent: string, rows: LeagueRow[] | undefined): number | null {
  const key = opponent.trim().toLowerCase();
  if (!key) return null;
  const row = (rows ?? []).find((r) => !r.is_own_team && r.team_name.trim().toLowerCase() === key);
  return row?.position ?? null;
}
