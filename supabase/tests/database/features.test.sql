-- pgTAP tests for feature batch 1 (20261124000001_features.sql):
-- availability reminders, partnership stats, head-to-head and the league table.
-- Everything runs in a transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ------------------------------------------------------------------ test data
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'f-cap@test.dev', '{"first_name":"Cara","surname":"Captain"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'f-p1@test.dev',  '{"first_name":"Pat","surname":"One"}'),
  ('00000000-0000-0000-0000-0000000005b2', 'f-p2@test.dev',  '{"first_name":"Pip","surname":"Two"}'),
  ('00000000-0000-0000-0000-0000000005b3', 'f-p3@test.dev',  '{"first_name":"Pam","surname":"Three"}'),
  ('00000000-0000-0000-0000-0000000005b4', 'f-p4@test.dev',  '{"first_name":"Pez","surname":"Four"}'),
  ('00000000-0000-0000-0000-0000000005c1', 'f-out@test.dev', '{"first_name":"Oscar","surname":"Outsider"}');

insert into public.clubs (id, name, join_code) overriding system value values
  (9501, 'Feature Club A', 'FEATAA'), (9502, 'Feature Club B', 'FEATBB');
insert into public.club_members (club_id, user_id, role) values
  (9501, '00000000-0000-0000-0000-0000000005a1', 'member'),
  (9501, '00000000-0000-0000-0000-0000000005b1', 'member'),
  (9501, '00000000-0000-0000-0000-0000000005b2', 'member'),
  (9501, '00000000-0000-0000-0000-0000000005b3', 'member'),
  (9501, '00000000-0000-0000-0000-0000000005b4', 'member'),
  (9502, '00000000-0000-0000-0000-0000000005c1', 'admin');
insert into public.divisions (id, club_id, name, team_count) overriding system value values (9501, 9501, 'Div 1', 8);
insert into public.seasons (id, club_id, name, is_current) overriding system value values (9501, 9501, 'Now', true);
-- Cara is captain (not admin), so the league table tests check the captain route.
insert into public.squads (id, club_id, name, ranking, division_id, captain_id) overriding system value values
  (9501, 9501, 'First team', 1, 9501, '00000000-0000-0000-0000-0000000005a1');
insert into public.squad_players (user_id, squad_id) values
  ('00000000-0000-0000-0000-0000000005a1', 9501),
  ('00000000-0000-0000-0000-0000000005b1', 9501),
  ('00000000-0000-0000-0000-0000000005b2', 9501),
  ('00000000-0000-0000-0000-0000000005b3', 9501),
  ('00000000-0000-0000-0000-0000000005b4', 9501);

-- Two played fixtures against the same club (name typed differently), three upcoming.
insert into public.fixtures (id, club_id, squad_id, season_id, division_id, opponent_name, fixture_date, start_time, location, is_home, opponent_league_position)
overriding system value values
  (9601, 9501, 9501, 9501, 9501, 'Opp A',         current_date - 20, '14:00', 'Here',  true,  5),
  (9602, 9501, 9501, 9501, 9501, 'opp a ',        current_date - 10, '14:00', 'There', false, 5),
  (9603, 9501, 9501, 9501, 9501, 'Upcoming Opp',  current_date + 5,  '14:00', 'Here',  true,  null),
  (9604, 9501, 9501, 9501, 9501, 'Two Day Opp',   current_date + 2,  '14:00', 'Here',  true,  null),
  (9605, 9501, 9501, 9501, 9501, 'Three Day Opp', current_date + 3,  '14:00', 'Here',  true,  null);

-- Fixture 9601: won 2-0, lost after a tie-break (sets 3-2 overall, so the fixture is won).
-- Fixture 9602: won 2-0.
insert into public.matches (id, fixture_id, rubber_number, pair_number, opponent_pair_number, match_date, did_win,
                            sets_won, sets_lost, games_won, games_lost, set_1_won, set_1_lost, set_2_won, set_2_lost, champ_tie)
overriding system value values
  (9701, 9601, 1, 1, 1, current_date - 20, true,  2, 0, 12, 6, 6, 3, 6, 3, null),
  (9702, 9601, 2, 2, 2, current_date - 20, false, 1, 2,  9, 9, 6, 3, 3, 6, 'L'),
  (9703, 9602, 1, 1, 1, current_date - 10, true,  2, 0, 12, 4, 6, 2, 6, 2, null);

-- Pat played twice with Pip (won 1, lost 1) and once with Pam (won).
insert into public.match_players (match_id, user_id, partner_user_id) values
  (9701, '00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b2'),
  (9701, '00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005b1'),
  (9702, '00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b2'),
  (9702, '00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005b1'),
  (9703, '00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b3'),
  (9703, '00000000-0000-0000-0000-0000000005b3', '00000000-0000-0000-0000-0000000005b1');

-- In 5 days: Cara and Pam replied, so Pat, Pip and Pez are due a reminder (3).
-- In 2 days: everyone but Pez replied (1). In 3 days: nobody replied, but no reminder is due.
insert into public.availability (fixture_id, user_id, is_available) values
  (9603, '00000000-0000-0000-0000-0000000005a1', true),
  (9603, '00000000-0000-0000-0000-0000000005b3', false),
  (9604, '00000000-0000-0000-0000-0000000005a1', true),
  (9604, '00000000-0000-0000-0000-0000000005b1', true),
  (9604, '00000000-0000-0000-0000-0000000005b2', true),
  (9604, '00000000-0000-0000-0000-0000000005b3', true);

create schema tests;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

-- ------------------------------------------------------------- reminders (as the scheduler)
select is(public.send_availability_reminders(), 4,
  'reminders go to non-responders 5 days (3) and 2 days (1) before a fixture');
select is(public.send_availability_reminders(current_date + 1), 5,
  'tomorrow, only the fixture then 2 days away is due (5 non-responders)');

set local role authenticated;

select tests.login('00000000-0000-0000-0000-0000000005b1');
select throws_ok($$ select public.send_availability_reminders() $$, '42501', null,
  'signed-in users cannot trigger the reminder job');

-- ------------------------------------------------------------- partnership stats
select results_eq(
  $$ select partner_id, rubbers, wins, win_percentage
       from public.partner_stats('00000000-0000-0000-0000-0000000005b1') $$,
  $$ values ('00000000-0000-0000-0000-0000000005b3'::uuid, 1, 1, 100.0::numeric),
            ('00000000-0000-0000-0000-0000000005b2'::uuid, 2, 1, 50.0::numeric) $$,
  'partner_stats: rubbers, wins and win % per partner, best first');
select results_eq(
  $$ select player_1_id, player_2_id, rubbers from public.squad_pairings(9501) limit 1 $$,
  $$ values ('00000000-0000-0000-0000-0000000005b1'::uuid, '00000000-0000-0000-0000-0000000005b2'::uuid, 2) $$,
  'squad_pairings lists pairs with 2+ rubbers before a single lucky win');
select results_eq(
  $$ select played, won, drawn, lost, rubbers_won, rubbers_lost from public.opponent_record(9501) $$,
  $$ values (2, 2, 0, 0, 2, 1) $$,
  'opponent_record groups "Opp A" and "opp a " as one club, 2 played, 2 won');

-- ------------------------------------------------------------- league table permissions
select throws_ok(
  $$ select public.save_league_table(9501, '[{"team_name":"X"}]'::jsonb) $$,
  'P0001', null, 'a member who isn''t a captain cannot edit the league table');
select throws_ok(
  $$ insert into public.league_table_rows (division_id, season_id, position, team_name) values (9501, 9501, 1, 'Sneaky') $$,
  '42501', null, 'nobody can write league rows directly (only through save_league_table)');

-- ------------------------------------------------------------- league table save
select tests.login('00000000-0000-0000-0000-0000000005a1');
select is(
  public.save_league_table(9501, '[
    {"team_name":"Top Dogs","played":5,"points":20},
    {"team_name":"OPP A","played":5,"points":15},
    {"team_name":"Upcoming Opp","played":5,"points":10}
  ]'::jsonb),
  1, 'captain saves the table; one upcoming fixture gets a new position');
select is((select opponent_league_position from public.fixtures where id = 9603), 3,
  'the upcoming fixture now has the opponent''s league position');
select results_eq(
  $$ select opponent_league_position from public.fixtures where id in (9601, 9602) order by id $$,
  $$ values (5), (5) $$,
  'fixtures with results keep their position, so past form scores don''t change');
select is(
  public.save_league_table(9501, '[
    {"team_name":"Top Dogs","played":5,"points":20},
    {"team_name":"OPP A","played":5,"points":15},
    {"team_name":"Upcoming Opp","played":5,"points":10}
  ]'::jsonb),
  0, 'saving the same table again changes no fixtures');
select throws_ok(
  $$ select public.save_league_table(9501, '[{"team_name":"Same"},{"team_name":" same"}]'::jsonb) $$,
  'P0001', null, 'a team cannot appear twice');

select tests.login('00000000-0000-0000-0000-0000000005b1');
select results_eq(
  $$ select position, team_name from public.league_table(9501) $$,
  $$ values (1, 'Top Dogs'), (2, 'OPP A'), (3, 'Upcoming Opp') $$,
  'members can read the table, top first');

-- ------------------------------------------------------------- another club sees nothing
select tests.login('00000000-0000-0000-0000-0000000005c1');
select is_empty($$ select * from public.partner_stats('00000000-0000-0000-0000-0000000005b1') $$,
  'other club cannot read a player''s partnership stats');
select is_empty($$ select * from public.squad_pairings(9501) $$, 'other club cannot read squad pairings');
select is_empty($$ select * from public.opponent_record(9501) $$, 'other club cannot read head-to-head records');
select is_empty($$ select * from public.league_table(9501) $$, 'other club cannot read the league table');
select is_empty($$ select * from public.league_table_rows where division_id = 9501 $$,
  'other club cannot read league rows directly');
select throws_ok(
  $$ select public.save_league_table(9501, '[{"team_name":"X"}]'::jsonb) $$,
  'P0001', null, 'other club cannot edit the league table');

select * from finish();
rollback;
