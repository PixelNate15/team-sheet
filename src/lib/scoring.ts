/**
 * Tennis doubles scoring rules, shared by the result entry screen and the
 * unit tests. The database (public.is_valid_set / save_fixture_result)
 * enforces exactly the same rules.
 */

/** Rubbers 1-4: our pair vs their pair (from captain_add_or_edit_result.py). */
export const RUBBERS = [
  { rubber: 1, pair: 1, opponentPair: 1 },
  { rubber: 2, pair: 2, opponentPair: 2 },
  { rubber: 3, pair: 1, opponentPair: 2 },
  { rubber: 4, pair: 2, opponentPair: 1 },
] as const;

export type ChampTie = 'W' | 'L' | null;

export interface RubberScore {
  set1Won: number | null;
  set1Lost: number | null;
  set2Won: number | null;
  set2Lost: number | null;
  champTie: ChampTie;
}

/** A set finishes 6-0 .. 6-4, 7-5 or 7-6 (either way round). */
export function isValidSet(won: number | null, lost: number | null): boolean {
  if (won == null || lost == null) return false;
  if (!Number.isInteger(won) || !Number.isInteger(lost)) return false;
  const hi = Math.max(won, lost);
  const lo = Math.min(won, lost);
  return (hi === 6 && lo >= 0 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}

export interface RubberOutcome {
  complete: boolean;
  error: string | null;
  needsChampTie: boolean;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  won: boolean | null;
}

export function evaluateRubber(s: RubberScore): RubberOutcome {
  const base: RubberOutcome = {
    complete: false,
    error: null,
    needsChampTie: false,
    setsWon: 0,
    setsLost: 0,
    gamesWon: (s.set1Won ?? 0) + (s.set2Won ?? 0),
    gamesLost: (s.set1Lost ?? 0) + (s.set2Lost ?? 0),
    won: null,
  };

  const set1Entered = s.set1Won != null && s.set1Lost != null;
  const set2Entered = s.set2Won != null && s.set2Lost != null;

  if (set1Entered && !isValidSet(s.set1Won, s.set1Lost)) {
    return { ...base, error: 'Set 1 must finish 6-0 to 6-4, 7-5 or 7-6' };
  }
  if (set2Entered && !isValidSet(s.set2Won, s.set2Lost)) {
    return { ...base, error: 'Set 2 must finish 6-0 to 6-4, 7-5 or 7-6' };
  }
  if (!set1Entered || !set2Entered) return base;

  let setsWon = Number(s.set1Won! > s.set1Lost!) + Number(s.set2Won! > s.set2Lost!);
  let setsLost = 2 - setsWon;
  const needsChampTie = setsWon === 1;

  if (needsChampTie) {
    if (!s.champTie) {
      return { ...base, setsWon, setsLost, needsChampTie, error: null };
    }
    if (s.champTie === 'W') setsWon = 2;
    else setsLost = 2;
  } else if (s.champTie) {
    return { ...base, setsWon, setsLost, error: 'A champions tie-break is only played at one set all' };
  }

  return {
    ...base,
    complete: true,
    needsChampTie,
    setsWon,
    setsLost,
    won: setsWon > setsLost,
  };
}

/** Team totals across all rubbers (the "total score" row of the results table). */
export function teamTotals(rubbers: RubberScore[]) {
  return rubbers.map(evaluateRubber).reduce(
    (acc, r) => ({
      setsWon: acc.setsWon + r.setsWon,
      setsLost: acc.setsLost + r.setsLost,
      rubbersWon: acc.rubbersWon + (r.won === true ? 1 : 0),
      rubbersLost: acc.rubbersLost + (r.won === false ? 1 : 0),
    }),
    { setsWon: 0, setsLost: 0, rubbersWon: 0, rubbersLost: 0 },
  );
}

/** "6-4 3-6 [W]" style score line. */
export function scoreLine(m: {
  set_1_won: number;
  set_1_lost: number;
  set_2_won: number;
  set_2_lost: number;
  champ_tie: 'W' | 'L' | null;
}) {
  const tie = m.champ_tie ? `  CT ${m.champ_tie === 'W' ? 'won' : 'lost'}` : '';
  return `${m.set_1_won}-${m.set_1_lost}  ${m.set_2_won}-${m.set_2_lost}${tie}`;
}
