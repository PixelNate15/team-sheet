// Shapes returned by the Supabase tables and RPC functions in supabase/migrations.

export type ThemePref = 'system' | 'light' | 'dark';

export interface Profile {
  id: string;
  first_name: string;
  surname: string;
  theme: ThemePref;
  expo_push_token: string | null;
  notifications_enabled: boolean;
  avatar_path: string | null;
}

export interface Club {
  id: number;
  name: string;
  join_code: string;
}

export interface Membership {
  club_id: number;
  role: 'member' | 'admin';
  club: Club;
}

export interface Squad {
  id: number;
  club_id: number;
  name: string;
  ranking: number;
  division_id: number | null;
  captain_id: string | null;
  default_match_fee_pence: number | null;
}

export interface Division {
  id: number;
  name: string;
  team_count: number;
}

export interface Season {
  id: number;
  name: string;
  is_current: boolean;
}

export interface MyFixture {
  id: number;
  opponent_name: string;
  fixture_date: string; // yyyy-mm-dd
  start_time: string; // HH:MM:SS
  location: string;
  is_home: boolean;
  notes: string | null;
  division_name: string | null;
  squad_name: string;
  is_available: boolean | null;
  reason: string | null;
  is_selected: boolean;
  pair_number: number | null;
  partner_name: string | null;
  team_selected: boolean;
}

export interface FixtureRow {
  id: number;
  club_id: number;
  squad_id: number;
  season_id: number | null;
  division_id: number | null;
  opponent_name: string;
  fixture_date: string;
  start_time: string;
  location: string;
  is_home: boolean;
  opponent_league_position: number | null;
  notes: string | null;
  team_selected_at: string | null;
  match_fee_pence: number | null;
  divisions?: { name: string } | null;
  squads?: { name: string } | null;
}

export interface SelectedPlayer {
  user_id: string;
  pair_number: number;
  selection_order: number;
  profiles: { first_name: string; surname: string } | null;
}

export interface MyResult {
  match_id: number;
  fixture_id: number;
  opponent_name: string;
  fixture_date: string;
  is_home: boolean;
  rubber_number: number;
  pair_number: number;
  opponent_pair: number;
  did_win: boolean;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  set_1_won: number;
  set_1_lost: number;
  set_2_won: number;
  set_2_lost: number;
  champ_tie: 'W' | 'L' | null;
  partner_id: string;
  partner_name: string;
  feedback_given: boolean;
  team_sets_won: number;
  team_sets_lost: number;
}

export interface MatchRow {
  id: number;
  fixture_id: number;
  rubber_number: number;
  pair_number: number;
  opponent_pair_number: number;
  did_win: boolean;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  set_1_won: number;
  set_1_lost: number;
  set_2_won: number;
  set_2_lost: number;
  champ_tie: 'W' | 'L' | null;
  match_players: {
    user_id: string;
    partner_user_id: string;
    profiles: { first_name: string; surname: string } | null;
  }[];
}

export interface Feedback {
  id: number;
  match_id: number;
  reviewer_id: string;
  reviewed_id: string;
  overall_rating: number;
  key_moments_rating: number;
  communication_rating: number;
  comments: string | null;
  created_at: string;
  matches?: {
    fixture_id: number;
    match_date: string;
    fixtures: { opponent_name: string; is_home: boolean } | null;
  } | null;
}

export interface Injury {
  id: number;
  user_id: string;
  description: string;
  start_date: string;
  expected_end_date: string;
  is_current: boolean;
  can_play: boolean;
  notes: string | null;
}

export interface ClubPlayer {
  user_id: string;
  first_name: string;
  surname: string;
  role: 'member' | 'admin';
  squad_id: number | null;
  squad_name: string | null;
  squad_ranking: number | null;
  division_name: string | null;
  is_captain: boolean;
  games_played: number;
  wins: number;
  win_percentage: number;
  last_match_date: string | null;
  injury_description: string | null;
  injury_can_play: boolean | null;
  fixtures_played_this_season: number;
  form: number | null;
}

export interface SquadFixture {
  id: number;
  opponent_name: string;
  fixture_date: string;
  start_time: string;
  location: string;
  is_home: boolean;
  available_count: number;
  unavailable_count: number;
  no_reply_count: number;
  team_selected: boolean;
}

export interface FixtureNeedingResult {
  id: number;
  opponent_name: string;
  fixture_date: string;
  start_time: string;
  location: string;
  is_home: boolean;
}

export interface SquadResult {
  id: number;
  opponent_name: string;
  fixture_date: string;
  is_home: boolean;
  sets_won: number;
  sets_lost: number;
  rubbers_won: number;
  rubbers_lost: number;
}

export interface AvailabilityReply {
  user_id: string;
  first_name: string;
  surname: string;
  is_available: boolean | null;
  reason: string | null;
  injury: string | null;
  injury_can_play: boolean | null;
}

export interface RecommendedPlayer {
  pair_number: number;
  selection_order: number;
  user_id: string;
  first_name: string;
  surname: string;
  form: number | null;
}

export interface AvailablePlayer {
  user_id: string;
  first_name: string;
  surname: string;
  form: number | null;
}

export interface FormPoint {
  week_date: string;
  form: number | null;
}

// ---------------------------------------------------------------- feature batch 1
// (20261124000001_features.sql)

/** public.partner_stats: one row per partner, best win % first. */
export interface PartnerStat {
  partner_id: string;
  first_name: string;
  surname: string;
  rubbers: number;
  wins: number;
  win_percentage: number;
  games_won: number;
  games_lost: number;
  last_played: string;
}

/** public.squad_pairings: each pair once; pairs with 2+ rubbers first. */
export interface SquadPairing {
  player_1_id: string;
  player_1_name: string;
  player_2_id: string;
  player_2_name: string;
  rubbers: number;
  wins: number;
  win_percentage: number;
  games_won: number;
  games_lost: number;
  last_played: string;
}

/** public.opponent_record: head-to-head against each opponent club. */
export interface OpponentRecord {
  opponent_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  rubbers_won: number;
  rubbers_lost: number;
  last_played: string;
}

/** public.league_table: the current season's table, top first. */
export interface LeagueRow {
  position: number;
  team_name: string;
  played: number;
  points: number;
  is_own_team: boolean;
  updated_at: string;
}

/** What save_league_table takes: rows in table order (position = index + 1). */
export interface LeagueRowInput {
  team_name: string;
  played: number;
  points: number;
  is_own_team: boolean;
}

// ---------------------------------------------------------------- batch 2

export interface LiftRow {
  user_id: string;
  name: string;
  kind: 'offer' | 'need';
  seats: number | null;
  seats_taken: number | null;
  note: string | null;
  driver_id: string | null;
  driver_name: string | null;
}

export interface FixtureMessage {
  id: number;
  fixture_id: number;
  user_id: string;
  body: string;
  is_notice: boolean;
  created_at: string;
  author: { first_name: string; surname: string; avatar_path: string | null } | null;
}

export interface FixtureFee {
  user_id: string;
  name: string;
  fee_pence: number;
  paid: boolean;
  paid_at: string | null;
}

export interface MyFee {
  fixture_id: number;
  opponent_name: string;
  is_home: boolean;
  fixture_date: string;
  fee_pence: number;
  paid: boolean;
  paid_at: string | null;
}

export interface OutstandingFee {
  user_id: string;
  name: string;
  fixtures_owed: number;
  amount_pence: number;
}

export interface ClubInvite {
  id: number;
  club_id: number;
  email: string;
  first_name: string | null;
  surname: string | null;
  squad_id: number | null;
  created_at: string;
  accepted_at: string | null;
  squads?: { name: string } | null;
}

export interface MyInvite {
  invite_id: number;
  club_id: number;
  club_name: string;
  squad_name: string | null;
}

export interface InviteImportResult {
  added: number;
  updated: number;
  already_members: number;
  invalid: number;
}

export interface SeasonReport {
  club: string;
  season: string;
  generated_at: string;
  squads: {
    name: string;
    division: string | null;
    fixtures: { date: string; opponent: string; is_home: boolean; sets_won: number | null; sets_lost: number | null }[];
    players: { name: string; fixtures: number; rubbers: number; wins: number; form: number | null }[];
    fees_outstanding_pence: number;
  }[];
}
