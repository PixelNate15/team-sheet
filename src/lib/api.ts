/**
 * Data access. Each function maps to a module of Original_Code/SQL/*.py,
 * but runs through Supabase (Row Level Security + RPC functions) instead of
 * a direct MariaDB connection.
 */
import type { PollVote } from './polls';
import { supabase } from './supabase';
import type {
  AvailabilityReply,
  AvailablePlayer,
  BorrowablePlayer,
  ClubInvite,
  ClubPlayer,
  Division,
  Feedback,
  FixtureFee,
  ChatMessage,
  FixtureNeedingResult,
  FixtureRow,
  FormPoint,
  LeagueRow,
  LeagueRowInput,
  Injury,
  InviteImportResult,
  LiftRow,
  MatchRow,
  Membership,
  MyFee,
  MyFixture,
  MyInvite,
  MyResult,
  OpponentRecord,
  OutstandingFee,
  PartnerStat,
  Profile,
  RecommendedPlayer,
  Season,
  SeasonReport,
  SelectedPlayer,
  Squad,
  SquadFixture,
  SquadPairing,
  SquadResult,
} from './types';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function unwrap<T>(res: { data: unknown; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------------------------------------------------------------- me / club
export interface Me {
  profile: Profile;
  membership: Membership | null;
  squads: Squad[];
  mySquadId: number | null;
}

export async function fetchMe(userId: string): Promise<Me> {
  const [profileRes, memberRes, squadRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase
      .from('club_members')
      .select('club_id, role, club:clubs(id, name, join_code)')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('squad_players').select('squad_id').eq('user_id', userId).maybeSingle(),
  ]);
  const profile = unwrap<Profile>(profileRes);
  const membership = unwrap<Membership | null>(memberRes);
  const mySquad = unwrap<{ squad_id: number } | null>(squadRes);

  let squads: Squad[] = [];
  if (membership) {
    squads = unwrap<Squad[]>(
      await supabase.from('squads').select('*').eq('club_id', membership.club_id).order('ranking'),
    );
  }
  return { profile, membership, squads, mySquadId: mySquad?.squad_id ?? null };
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', userId));
}

export const createClub = (args: {
  clubName: string;
  seasonName: string;
  squadName: string;
  divisionName: string;
  teamCount: number;
}) =>
  rpc<number>('create_club', {
    p_club_name: args.clubName,
    p_season_name: args.seasonName,
    p_squad_name: args.squadName,
    p_division_name: args.divisionName,
    p_team_count: args.teamCount,
  });

export const joinClub = (code: string) => rpc<number>('join_club', { p_code: code });
export const regenerateJoinCode = () => rpc<string>('regenerate_join_code');
export const leaveClub = () => rpc<void>('leave_club');
/** Deletes the player's photo file (storage isn't cleaned up by the database), then the account. */
export async function deleteMyAccount(avatarPath?: string | null) {
  if (avatarPath) await supabase.storage.from('avatars').remove([avatarPath]);
  await rpc<void>('delete_my_account');
}

// ---------------------------------------------------------------- fixtures (member)
export const fetchMyFixtures = () => rpc<MyFixture[]>('my_fixtures');

export async function fetchFixture(id: number): Promise<FixtureRow> {
  return unwrap<FixtureRow>(
    await supabase
      .from('fixtures')
      .select('*, divisions(name), squads(name)')
      .eq('id', id)
      .single(),
  );
}

export async function fetchFixtureTeam(id: number): Promise<SelectedPlayer[]> {
  return unwrap<SelectedPlayer[]>(
    await supabase
      .from('team_selection_players')
      .select('user_id, pair_number, selection_order, profiles(first_name, surname)')
      .eq('fixture_id', id)
      .order('pair_number')
      .order('selection_order'),
  );
}

// ---------------------------------------------------------------- availability
export async function setAvailability(fixtureId: number, userId: string, isAvailable: boolean, reason?: string) {
  unwrap(
    await supabase.from('availability').upsert({
      fixture_id: fixtureId,
      user_id: userId,
      is_available: isAvailable,
      reason: isAvailable ? null : reason?.trim() || null,
      submitted_at: new Date().toISOString(),
    }),
  );
}

export const fetchFixtureAvailability = (fixtureId: number) =>
  rpc<AvailabilityReply[]>('fixture_availability', { p_fixture: fixtureId });

export const chaseAvailability = (fixtureId: number) => rpc<number>('chase_availability', { p_fixture: fixtureId });

// ---------------------------------------------------------------- injury
export async function fetchCurrentInjury(userId: string): Promise<Injury | null> {
  return unwrap<Injury | null>(
    await supabase.from('injuries').select('*').eq('user_id', userId).eq('is_current', true).maybeSingle(),
  );
}

export async function saveInjury(
  userId: string,
  existingId: number | null,
  v: { description: string; expected_end_date: string; can_play: boolean; notes: string },
) {
  const row = {
    description: v.description.trim(),
    expected_end_date: v.expected_end_date,
    can_play: v.can_play,
    notes: v.notes.trim() || null,
  };
  if (existingId) {
    unwrap(await supabase.from('injuries').update(row).eq('id', existingId));
  } else {
    unwrap(await supabase.from('injuries').insert({ ...row, user_id: userId, is_current: true }));
  }
}

/** Mark recovered: keeps the injury history (the original deleted it). */
export async function endInjury(injuryId: number) {
  unwrap(
    await supabase
      .from('injuries')
      .update({ is_current: false, ended_on: new Date().toISOString().slice(0, 10) })
      .eq('id', injuryId),
  );
}

// ---------------------------------------------------------------- results
export const fetchMyResults = () => rpc<MyResult[]>('my_results');

export async function fetchFixtureMatches(fixtureId: number): Promise<MatchRow[]> {
  return unwrap<MatchRow[]>(
    await supabase
      .from('matches')
      .select(
        '*, match_players(user_id, partner_user_id, profiles!match_players_user_id_fkey(first_name, surname))',
      )
      .eq('fixture_id', fixtureId)
      .order('rubber_number'),
  );
}

export const saveFixtureResult = (
  fixtureId: number,
  matches: {
    rubber_number: number;
    player_1: string;
    player_2: string;
    set_1_won: number;
    set_1_lost: number;
    set_2_won: number;
    set_2_lost: number;
    champ_tie: 'W' | 'L' | null;
  }[],
) => rpc<void>('save_fixture_result', { p_fixture: fixtureId, p_matches: matches });

// ---------------------------------------------------------------- feedback
const feedbackSelect = '*, matches(fixture_id, match_date, fixtures(opponent_name, is_home))';

export async function fetchFeedbackReceived(userId: string, limit = 50): Promise<Feedback[]> {
  return unwrap<Feedback[]>(
    await supabase
      .from('partner_feedback')
      .select(feedbackSelect)
      .eq('reviewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function fetchFeedbackForFixture(userId: string, fixtureId: number): Promise<Feedback[]> {
  return unwrap<Feedback[]>(
    await supabase
      .from('partner_feedback')
      .select('*, matches!inner(fixture_id, match_date, fixtures(opponent_name, is_home))')
      .eq('reviewed_id', userId)
      .eq('matches.fixture_id', fixtureId),
  );
}

export async function submitFeedback(v: {
  match_id: number;
  reviewer_id: string;
  reviewed_id: string;
  overall_rating: number;
  key_moments_rating: number;
  communication_rating: number;
  comments: string;
}) {
  unwrap(await supabase.from('partner_feedback').insert({ ...v, comments: v.comments.trim() || null }));
}

// ---------------------------------------------------------------- captain
export const fetchClubPlayers = () => rpc<ClubPlayer[]>('club_players');
export const fetchSquadFixtures = (squadId: number) => rpc<SquadFixture[]>('squad_fixtures', { p_squad: squadId });
export const fetchFixturesNeedingResults = (squadId: number) =>
  rpc<FixtureNeedingResult[]>('fixtures_needing_results', { p_squad: squadId });
export const fetchSquadResults = (squadId: number) => rpc<SquadResult[]>('squad_results', { p_squad: squadId });
export const fetchRecommendedTeam = (fixtureId: number) =>
  rpc<RecommendedPlayer[]>('recommended_team', { p_fixture: fixtureId });
export const fetchAvailablePlayers = (fixtureId: number) =>
  rpc<AvailablePlayer[]>('available_players', { p_fixture: fixtureId });
export const fetchFormHistory = (userId: string) => rpc<FormPoint[]>('form_history', { p_user: userId });

export const saveFixture = (v: {
  fixtureId: number | null;
  squadId: number;
  opponentName: string;
  fixtureDate: string;
  startTime: string;
  location: string;
  isHome: boolean;
  leaguePosition: number | null;
  notes: string;
  players: { user_id: string; pair_number: number; selection_order: number }[] | null;
}) =>
  rpc<number>('save_fixture', {
    p_fixture_id: v.fixtureId,
    p_squad_id: v.squadId,
    p_opponent_name: v.opponentName,
    p_fixture_date: v.fixtureDate,
    p_start_time: v.startTime,
    p_location: v.location,
    p_is_home: v.isHome,
    p_league_position: v.leaguePosition,
    p_notes: v.notes,
    p_players: v.players,
  });

export const removeFixture = (fixtureId: number) => rpc<void>('remove_fixture', { p_fixture: fixtureId });
export const addPlayersToSquad = (squadId: number, userIds: string[]) =>
  rpc<number>('add_players_to_squad', { p_squad: squadId, p_users: userIds });
export const movePlayerDown = (userId: string) => rpc<string | null>('move_player_down', { p_user: userId });

// ---------------------------------------------------------------- club admin
export const adminSetPlayerSquad = (userId: string, squadId: number | null) =>
  rpc<void>('admin_set_player_squad', { p_user: userId, p_squad: squadId });
export const setCurrentSeason = (seasonId: number) => rpc<void>('set_current_season', { p_season: seasonId });

export async function fetchSeasons(clubId: number): Promise<Season[]> {
  return unwrap<Season[]>(await supabase.from('seasons').select('*').eq('club_id', clubId).order('id', { ascending: false }));
}

export async function createSeason(clubId: number, name: string) {
  unwrap(await supabase.from('seasons').insert({ club_id: clubId, name: name.trim(), is_current: false }));
}

export async function fetchDivisions(clubId: number): Promise<Division[]> {
  return unwrap<Division[]>(await supabase.from('divisions').select('*').eq('club_id', clubId).order('name'));
}

export async function createDivision(clubId: number, name: string, teamCount: number) {
  unwrap(await supabase.from('divisions').insert({ club_id: clubId, name: name.trim(), team_count: teamCount }));
}

export async function createSquad(clubId: number, name: string, ranking: number, divisionId: number | null) {
  unwrap(
    await supabase.from('squads').insert({ club_id: clubId, name: name.trim(), ranking, division_id: divisionId }),
  );
}

export async function updateSquad(squadId: number, patch: Partial<Pick<Squad, 'name' | 'division_id' | 'captain_id'>>) {
  unwrap(await supabase.from('squads').update(patch).eq('id', squadId));
}

export async function deleteSquad(squadId: number) {
  unwrap(await supabase.from('squads').delete().eq('id', squadId));
}

export async function setMemberRole(clubId: number, userId: string, role: 'member' | 'admin') {
  unwrap(await supabase.from('club_members').update({ role }).eq('club_id', clubId).eq('user_id', userId));
}

export async function removeMember(clubId: number, userId: string) {
  unwrap(await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId));
}

export async function renameClub(clubId: number, name: string) {
  unwrap(await supabase.from('clubs').update({ name: name.trim() }).eq('id', clubId));
}

// ---------------------------------------------------------------- stats & league table
export const fetchPartnerStats = (userId: string) => rpc<PartnerStat[]>('partner_stats', { p_user: userId });
export const fetchSquadPairings = (squadId: number) => rpc<SquadPairing[]>('squad_pairings', { p_squad: squadId });
export const fetchOpponentRecord = (squadId: number) => rpc<OpponentRecord[]>('opponent_record', { p_squad: squadId });

export const fetchLeagueTable = (divisionId: number) => rpc<LeagueRow[]>('league_table', { p_division: divisionId });
export const canManageDivision = (divisionId: number) => rpc<boolean>('can_manage_division', { p_division: divisionId });
/** Returns how many upcoming fixtures had their opponent's league position updated. */
export const saveLeagueTable = (divisionId: number, rows: LeagueRowInput[]) =>
  rpc<number>('save_league_table', { p_division: divisionId, p_rows: rows });

// ---------------------------------------------------------------- lifts
export const fetchLiftBoard = (fixtureId: number) => rpc<LiftRow[]>('lift_board', { p_fixture: fixtureId });
/** kind null withdraws. */
export const setMyLift = (fixtureId: number, kind: 'offer' | 'need' | null, seats: number | null, note: string | null) =>
  rpc<void>('set_my_lift', { p_fixture: fixtureId, p_kind: kind, p_seats: seats, p_note: note });
export const takePassenger = (fixtureId: number, passengerId: string) =>
  rpc<void>('take_passenger', { p_fixture: fixtureId, p_passenger: passengerId });
export const dropPassenger = (fixtureId: number, passengerId: string) =>
  rpc<void>('drop_passenger', { p_fixture: fixtureId, p_passenger: passengerId });

// ---------------------------------------------------------------- chat (club and fixtures)
/** The club chat (fixtureId null) or one fixture's chat, oldest first. */
export async function fetchMessages(clubId: number, fixtureId: number | null): Promise<ChatMessage[]> {
  let q = supabase
    .from('chat_messages')
    .select('*, author:profiles(first_name, surname, avatar_path)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(300);
  q = fixtureId == null ? q.is('fixture_id', null) : q.eq('fixture_id', fixtureId);
  const rows = unwrap<ChatMessage[]>(await q);
  return rows.reverse();
}

export async function postMessage(v: {
  clubId: number;
  fixtureId: number | null;
  userId: string;
  body: string;
  isNotice: boolean;
  pollOptions?: string[] | null;
}) {
  unwrap(
    await supabase.from('chat_messages').insert({
      club_id: v.clubId,
      fixture_id: v.fixtureId,
      user_id: v.userId,
      body: v.body.trim(),
      is_notice: v.isNotice,
      poll: v.pollOptions?.length ? { options: v.pollOptions } : null,
    }),
  );
}

export async function deleteMessage(id: number) {
  unwrap(await supabase.from('chat_messages').delete().eq('id', id));
}

export async function fetchPollVotes(messageIds: number[]): Promise<PollVote[]> {
  if (messageIds.length === 0) return [];
  return unwrap<PollVote[]>(await supabase.from('chat_poll_votes').select('message_id, user_id, option').in('message_id', messageIds));
}

/** Vote for an option, or pass null to take your vote back. */
export const votePoll = (messageId: number, option: number | null) =>
  rpc<void>('vote_poll', { p_message: messageId, p_option: option });

// ---------------------------------------------------------------- match fees
export const fetchFixtureFees = (fixtureId: number) => rpc<FixtureFee[]>('fixture_fees', { p_fixture: fixtureId });
export const fetchMyFees = () => rpc<MyFee[]>('my_fees');
export const fetchOutstandingFees = (squadId: number) =>
  rpc<OutstandingFee[]>('squad_fees_outstanding', { p_squad: squadId });
export const setFixtureFee = (fixtureId: number, feePence: number | null) =>
  rpc<void>('set_fixture_fee', { p_fixture: fixtureId, p_fee_pence: feePence });
export const setFeePaid = (fixtureId: number, userId: string, paid: boolean) =>
  rpc<void>('set_fee_paid', { p_fixture: fixtureId, p_user: userId, p_paid: paid });

export async function setSquadDefaultFee(squadId: number, feePence: number | null) {
  unwrap(await supabase.from('squads').update({ default_match_fee_pence: feePence }).eq('id', squadId));
}

// ---------------------------------------------------------------- photos
export async function fetchClubAvatars(): Promise<{ id: string; avatar_path: string | null }[]> {
  return unwrap(await supabase.from('profiles').select('id, avatar_path').not('avatar_path', 'is', null));
}

/** Upload a JPEG into the player's own folder and point their profile at it. Returns the new path. */
export async function uploadAvatar(userId: string, jpeg: ArrayBuffer, previousPath: string | null): Promise<string> {
  const path = `${userId}/${Date.now().toString(36)}.jpg`;
  unwrap(await supabase.storage.from('avatars').upload(path, jpeg, { contentType: 'image/jpeg', upsert: false }));
  unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId));
  if (previousPath) await supabase.storage.from('avatars').remove([previousPath]);
  return path;
}

export async function removeAvatar(userId: string, path: string | null) {
  unwrap(await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId));
  if (path) await supabase.storage.from('avatars').remove([path]);
}

export function avatarUrl(path: string) {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------- invites
export const importInvites = (rows: { email: string; first_name: string; surname: string; squad_id: number | null }[]) =>
  rpc<InviteImportResult>('import_invites', { p_rows: rows });
export const fetchMyInvites = () => rpc<MyInvite[]>('my_invites');
export const acceptInvite = (inviteId: number) => rpc<number>('accept_invite', { p_invite: inviteId });

export async function fetchClubInvites(clubId: number): Promise<ClubInvite[]> {
  return unwrap<ClubInvite[]>(
    await supabase
      .from('club_invites')
      .select('*, squads(name)')
      .eq('club_id', clubId)
      .order('accepted_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false }),
  );
}

export async function deleteInvite(id: number) {
  unwrap(await supabase.from('club_invites').delete().eq('id', id));
}

// ---------------------------------------------------------------- season report
export const fetchSeasonReport = (seasonId: number) => rpc<SeasonReport>('season_report', { p_season: seasonId });

// ---------------------------------------------------------------- playing up
/** Most times a player can be borrowed by a higher team in one season (enforced by the database). */
export const PLAY_UP_LIMIT = 2;
export const fetchBorrowablePlayers = (fixtureId: number) =>
  rpc<BorrowablePlayer[]>('borrowable_players', { p_fixture: fixtureId });
export const borrowPlayer = (fixtureId: number, userId: string) =>
  rpc<void>('borrow_player', { p_fixture: fixtureId, p_user: userId });
export const releaseBorrowedPlayer = (fixtureId: number, userId: string) =>
  rpc<void>('release_borrowed_player', { p_fixture: fixtureId, p_user: userId });
