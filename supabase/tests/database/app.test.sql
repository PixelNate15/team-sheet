-- pgTAP tests: algorithm parity with the original Python, result rules, and
-- Row Level Security. Run with:  npx supabase test db --db-url "$DB_URL"
-- Everything runs in a transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ------------------------------------------------------------------ fixtures
-- Users (the trigger creates their profiles)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'cap@test.dev', '{"first_name":"Cara","surname":"Captain"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'p1@test.dev',  '{"first_name":"Pat","surname":"One"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'p2@test.dev',  '{"first_name":"Pip","surname":"Two"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'p3@test.dev',  '{"first_name":"Pam","surname":"Three"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'p4@test.dev',  '{"first_name":"Pez","surname":"Four"}'),
  ('00000000-0000-0000-0000-0000000000b5', 'p5@test.dev',  '{"first_name":"Poe","surname":"Five"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@test.dev', '{"first_name":"Oscar","surname":"Outsider"}');

insert into public.clubs (id, name, join_code) overriding system value values
  (9001, 'Club A', 'AAAAAA'), (9002, 'Club B', 'BBBBBB');
insert into public.club_members (club_id, user_id, role) values
  (9001, '00000000-0000-0000-0000-0000000000a1', 'admin'),
  (9001, '00000000-0000-0000-0000-0000000000b1', 'member'),
  (9001, '00000000-0000-0000-0000-0000000000b2', 'member'),
  (9001, '00000000-0000-0000-0000-0000000000b3', 'member'),
  (9001, '00000000-0000-0000-0000-0000000000b4', 'member'),
  (9001, '00000000-0000-0000-0000-0000000000b5', 'member'),
  (9002, '00000000-0000-0000-0000-0000000000c1', 'admin');
insert into public.divisions (id, club_id, name, team_count) overriding system value values (9001, 9001, 'Div 1', 8);
insert into public.seasons (id, club_id, name, is_current) overriding system value values (9001, 9001, 'Now', true);
insert into public.squads (id, club_id, name, ranking, division_id, captain_id) overriding system value values
  (9001, 9001, 'First team', 1, 9001, '00000000-0000-0000-0000-0000000000a1'),
  (9002, 9001, 'Second team', 2, 9001, null);
insert into public.squad_players (user_id, squad_id) values
  ('00000000-0000-0000-0000-0000000000a1', 9001),
  ('00000000-0000-0000-0000-0000000000b1', 9001),
  ('00000000-0000-0000-0000-0000000000b2', 9001),
  ('00000000-0000-0000-0000-0000000000b3', 9001),
  ('00000000-0000-0000-0000-0000000000b4', 9001),
  ('00000000-0000-0000-0000-0000000000b5', 9002);

-- Same scenario as the Python reference run (Original_Code/System/form_score_calculation.py):
-- three resulted fixtures 60, 30 and 10 days ago, opponent positions 3, 5, 1 in an 8-team division.
insert into public.fixtures (id, club_id, squad_id, season_id, division_id, opponent_name, fixture_date, start_time, location, is_home, opponent_league_position)
overriding system value values
  (9101, 9001, 9001, 9001, 9001, 'Opp A', current_date - 60, '14:00', 'Here', true, 3),
  (9102, 9001, 9001, 9001, 9001, 'Opp B', current_date - 30, '14:00', 'There', false, 5),
  (9103, 9001, 9001, 9001, 9001, 'Opp C', current_date - 10, '14:00', 'Here', true, 1),
  (9104, 9001, 9001, 9001, 9001, 'Opp D', current_date + 7, '14:00', 'Here', true, 2),
  (9105, 9001, 9001, 9001, 9001, 'Opp E', current_date - 3, '14:00', 'Here', true, 4);

insert into public.matches (id, fixture_id, rubber_number, pair_number, opponent_pair_number, match_date, did_win,
                            sets_won, sets_lost, games_won, games_lost, set_1_won, set_1_lost, set_2_won, set_2_lost, champ_tie)
overriding system value values
  (9201, 9101, 1, 1, 1, current_date - 60, true,  2, 0, 12, 8, 6, 4, 6, 4, null),
  (9202, 9102, 1, 1, 1, current_date - 30, false, 1, 2,  9, 9, 6, 3, 3, 6, 'L'),
  (9203, 9103, 1, 1, 1, current_date - 10, true,  2, 0, 12, 3, 6, 1, 6, 2, null);

insert into public.match_players (match_id, user_id, partner_user_id, partner_form_at_match) values
  (9201, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 0.9),
  (9201, '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', null),
  (9202, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', null),
  (9202, '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', null),
  (9203, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 1.1),
  (9203, '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', null);

-- Availability for the upcoming fixture: p3 is available but injured and can't play.
insert into public.availability (fixture_id, user_id, is_available) values
  (9104, '00000000-0000-0000-0000-0000000000a1', true),
  (9104, '00000000-0000-0000-0000-0000000000b1', true),
  (9104, '00000000-0000-0000-0000-0000000000b2', true),
  (9104, '00000000-0000-0000-0000-0000000000b3', true),
  (9104, '00000000-0000-0000-0000-0000000000b4', true);
insert into public.injuries (user_id, description, expected_end_date, can_play) values
  ('00000000-0000-0000-0000-0000000000b3', 'Ankle', current_date + 14, false);

-- Helper: act as a signed-in user (rolled back with everything else).
create schema tests;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

set local role authenticated;

-- ------------------------------------------------------------- form score parity
select tests.login('00000000-0000-0000-0000-0000000000a1');
select is(public.form_score('00000000-0000-0000-0000-0000000000b1'), 0.8577::numeric,
  'form_score today matches the original Python (0.8577)');
select is(public.form_score('00000000-0000-0000-0000-0000000000b1', current_date - 20), 0.5166::numeric,
  'form_score 20 days ago matches the original Python (0.5166)');
select is(public.form_score('00000000-0000-0000-0000-0000000000b1', current_date - 60), null::numeric,
  'form_score is null with no earlier matches (original returned None)');
select is((select count(*)::int from public.form_history('00000000-0000-0000-0000-0000000000b1')), 10,
  'form_history returns 10 weekly points');

-- ------------------------------------------------------------- recommended team
select is((select count(*)::int from public.recommended_team(9104)), 4, 'recommended team has 4 players');
select ok(not exists (select 1 from public.recommended_team(9104) where user_id = '00000000-0000-0000-0000-0000000000b3'),
  'injured player who cannot play is never recommended');
select set_eq(
  $$ select user_id from public.recommended_team(9104) where pair_number = 1 $$,
  array['00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid],
  'pair 1 is the two in-form players');
select is((select count(distinct user_id)::int from public.recommended_team(9104)), 4, 'no player is picked twice');

-- ------------------------------------------------------------- result entry rules
select throws_ok(
  $$ select public.save_fixture_result(9105, '[
      {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null},
      {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null},
      {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null},
      {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":6,"set_1_lost":5,"set_2_won":6,"set_2_lost":3,"champ_tie":null}
    ]'::jsonb) $$,
  'P0001', null, 'an impossible set score (6-5) is rejected');
select is((select count(*)::int from public.matches where fixture_id = 9105), 0,
  'a rejected result saves nothing (single transaction, unlike the original)');

select throws_ok(
  $$ select public.save_fixture_result(9105, '[
      {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":6,"set_1_lost":2,"set_2_won":3,"set_2_lost":6,"champ_tie":null},
      {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null},
      {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null},
      {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":6,"set_1_lost":2,"set_2_won":6,"set_2_lost":3,"champ_tie":null}
    ]'::jsonb) $$,
  'P0001', null, 'one set all requires a champions tie-break result');

select lives_ok(
  $$ select public.save_fixture_result(9105, '[
      {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":6,"set_1_lost":2,"set_2_won":3,"set_2_lost":6,"champ_tie":"W"},
      {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":4,"set_1_lost":6,"set_2_won":5,"set_2_lost":7,"champ_tie":null},
      {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000000b1","player_2":"00000000-0000-0000-0000-0000000000b2","set_1_won":7,"set_1_lost":6,"set_2_won":6,"set_2_lost":4,"champ_tie":null},
      {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000000b3","player_2":"00000000-0000-0000-0000-0000000000b4","set_1_won":6,"set_1_lost":0,"set_2_won":6,"set_2_lost":0,"champ_tie":null}
    ]'::jsonb) $$,
  'a valid result saves');
select results_eq(
  $$ select sum(sets_won)::int, sum(sets_lost)::int, count(*)::int from public.matches where fixture_id = 9105 $$,
  $$ values (6, 3, 4) $$,
  'saved totals: champ tie-break counts as a set; 4 rubbers');
select results_eq(
  $$ select array_agg(pair_number order by rubber_number), array_agg(opponent_pair_number order by rubber_number)
       from public.matches where fixture_id = 9105 $$,
  $$ values (array[1,2,1,2], array[1,2,2,1]) $$,
  'rubbers keep the original pairing [1,2,1,2] v [1,2,2,1]');
select is((select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id where m.fixture_id = 9105), 8,
  'each rubber stores both players');

-- ------------------------------------------------------------- Row Level Security
-- Another club sees nothing of club A.
select tests.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.fixtures where club_id = 9001), 0, 'other club cannot see club A fixtures');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'other club cannot see club A players');
select is(public.form_score('00000000-0000-0000-0000-0000000000b1'), null::numeric, 'other club cannot read a player''s form');
select throws_ok($$ select * from public.recommended_team(9104) $$, 'P0001', null, 'other club cannot get a recommended team');

-- A member can read their club but not act as captain or as someone else.
select tests.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.fixtures where club_id = 9001), 5, 'member sees their club fixtures');
select throws_ok(
  $$ insert into public.fixtures (club_id, squad_id, opponent_name, fixture_date, start_time, location, is_home)
     values (9001, 9001, 'Sneaky', current_date + 3, '10:00', 'X', true) $$,
  '42501', null, 'member cannot create fixtures');
select is_empty($$ update public.squads set name = 'Hacked' where id = 9001 returning id $$, 'member cannot rename squads');
select lives_ok(
  $$ insert into public.availability (fixture_id, user_id, is_available) values (9104, '00000000-0000-0000-0000-0000000000b1', false)
     on conflict (fixture_id, user_id) do update set is_available = excluded.is_available $$,
  'member can set their own availability');
select throws_ok(
  $$ insert into public.availability (fixture_id, user_id, is_available) values (9104, '00000000-0000-0000-0000-0000000000b4', false)
     on conflict (fixture_id, user_id) do update set is_available = excluded.is_available $$,
  '42501', null, 'member cannot set someone else''s availability');

-- Feedback: only your partner from that rubber can rate you; only you and your captain can read it.
select tests.login('00000000-0000-0000-0000-0000000000b4');
select throws_ok(
  $$ insert into public.partner_feedback (match_id, reviewer_id, reviewed_id, overall_rating, key_moments_rating, communication_rating)
     values (9201, '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 1, 1, 1) $$,
  '42501', null, 'a non-partner cannot rate a player');

select tests.login('00000000-0000-0000-0000-0000000000b2');
select lives_ok(
  $$ insert into public.partner_feedback (match_id, reviewer_id, reviewed_id, overall_rating, key_moments_rating, communication_rating, comments)
     values (9201, '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 8, 7, 9, 'Great net play') $$,
  'partner can rate the player they played with');

select tests.login('00000000-0000-0000-0000-0000000000b5');
select is((select count(*)::int from public.partner_feedback where reviewed_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'a club-mate in another team cannot read someone''s feedback');

select tests.login('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.partner_feedback where reviewed_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'the player''s captain can read their feedback');

select * from finish();
rollback;
