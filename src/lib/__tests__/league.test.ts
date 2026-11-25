import { leaguePositionFor } from '../league';
import type { LeagueRow } from '../types';

const row = (position: number, team_name: string, is_own_team = false): LeagueRow =>
  ({ position, team_name, is_own_team, played: 0, points: 0, updated_at: '' }) as LeagueRow;
const table = [row(1, 'Riverside LTC A'), row(2, 'Oakwood TC'), row(3, 'Our Club', true)];

describe('leaguePositionFor', () => {
  it('matches ignoring capitals and outer spaces, like the database', () => {
    expect(leaguePositionFor('  oakwood tc ', table)).toBe(2);
    expect(leaguePositionFor('RIVERSIDE LTC A', table)).toBe(1);
  });

  it('returns null for unknown teams, blanks and your own team', () => {
    expect(leaguePositionFor('Oakwood', table)).toBeNull();
    expect(leaguePositionFor('', table)).toBeNull();
    expect(leaguePositionFor('Our Club', table)).toBeNull();
    expect(leaguePositionFor('Oakwood TC', undefined)).toBeNull();
  });
});
