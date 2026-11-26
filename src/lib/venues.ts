import type { Venue } from './types';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The saved venue for an opponent: a venue matches when the opponent's name
 * starts with the venue's name, ignoring capitals and spacing, so "Oakwood TC"
 * covers "Oakwood TC B". The longest (most specific) match wins.
 */
export function venueFor(opponent: string, venues: Venue[] | undefined): Venue | null {
  const o = norm(opponent);
  if (!o) return null;
  let best: Venue | null = null;
  for (const v of venues ?? []) {
    const n = norm(v.name);
    if (n && (o === n || o.startsWith(`${n} `)) && (!best || n.length > norm(best.name).length)) best = v;
  }
  return best;
}
