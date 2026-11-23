/// <reference types="jest" />
import { evaluateRubber, isValidSet, RUBBERS, scoreLine, teamTotals, type RubberScore } from '../scoring';

const r = (s1w: number, s1l: number, s2w: number, s2l: number, champTie: 'W' | 'L' | null = null): RubberScore => ({
  set1Won: s1w,
  set1Lost: s1l,
  set2Won: s2w,
  set2Lost: s2l,
  champTie,
});

describe('isValidSet', () => {
  it.each([
    [6, 0],
    [6, 4],
    [4, 6],
    [7, 5],
    [5, 7],
    [7, 6],
    [6, 7],
  ])('accepts %i-%i', (w, l) => expect(isValidSet(w, l)).toBe(true));

  // The original accepted any scores up to 7, e.g. 1-0 or 3-3.
  it.each([
    [1, 0],
    [3, 3],
    [6, 5],
    [6, 6],
    [7, 4],
    [7, 7],
    [8, 6],
    [5, 4],
  ])('rejects %i-%i', (w, l) => expect(isValidSet(w, l)).toBe(false));

  it('rejects missing and non-integer scores', () => {
    expect(isValidSet(null, 4)).toBe(false);
    expect(isValidSet(6, null)).toBe(false);
    expect(isValidSet(6.5, 4)).toBe(false);
  });
});

describe('evaluateRubber', () => {
  it('straight-sets win', () => {
    const o = evaluateRubber(r(6, 3, 7, 5));
    expect(o).toMatchObject({ complete: true, won: true, setsWon: 2, setsLost: 0, gamesWon: 13, gamesLost: 8, needsChampTie: false });
  });

  it('straight-sets loss', () => {
    expect(evaluateRubber(r(2, 6, 6, 7))).toMatchObject({ complete: true, won: false, setsWon: 0, setsLost: 2 });
  });

  it('one set all needs a champions tie-break before it is complete', () => {
    const o = evaluateRubber(r(6, 4, 3, 6));
    expect(o).toMatchObject({ complete: false, needsChampTie: true, error: null });
  });

  it('champions tie-break decides the rubber and adds a set but no games', () => {
    expect(evaluateRubber(r(6, 4, 3, 6, 'W'))).toMatchObject({ complete: true, won: true, setsWon: 2, setsLost: 1, gamesWon: 9, gamesLost: 10 });
    expect(evaluateRubber(r(6, 4, 3, 6, 'L'))).toMatchObject({ complete: true, won: false, setsWon: 1, setsLost: 2 });
  });

  it('rejects a champions tie-break when the sets are not one all', () => {
    const o = evaluateRubber(r(6, 4, 6, 3, 'W'));
    expect(o.complete).toBe(false);
    expect(o.error).toMatch(/one set all/);
  });

  it('reports invalid set scores', () => {
    expect(evaluateRubber(r(6, 5, 6, 3)).error).toMatch(/Set 1/);
    expect(evaluateRubber(r(6, 3, 1, 0)).error).toMatch(/Set 2/);
  });

  it('is incomplete (not an error) while scores are still being typed', () => {
    const o = evaluateRubber({ set1Won: 6, set1Lost: 3, set2Won: null, set2Lost: null, champTie: null });
    expect(o).toMatchObject({ complete: false, error: null });
  });
});

describe('teamTotals', () => {
  it('sums sets and rubbers across the four rubbers', () => {
    const totals = teamTotals([r(6, 3, 6, 3), r(3, 6, 4, 6), r(6, 4, 4, 6, 'W'), r(7, 6, 6, 4)]);
    expect(totals).toEqual({ setsWon: 6, setsLost: 3, rubbersWon: 3, rubbersLost: 1 });
  });
});

describe('RUBBERS', () => {
  it('matches the original pairing: our pairs [1,2,1,2] v their pairs [1,2,2,1]', () => {
    expect(RUBBERS.map((x) => x.pair)).toEqual([1, 2, 1, 2]);
    expect(RUBBERS.map((x) => x.opponentPair)).toEqual([1, 2, 2, 1]);
  });
});

describe('scoreLine', () => {
  it('formats sets and the champions tie-break', () => {
    expect(scoreLine({ set_1_won: 6, set_1_lost: 4, set_2_won: 3, set_2_lost: 6, champ_tie: 'W' })).toBe('6-4  3-6  CT won');
    expect(scoreLine({ set_1_won: 6, set_1_lost: 0, set_2_won: 6, set_2_lost: 1, champ_tie: null })).toBe('6-0  6-1');
  });
});
