-- pgTAP tests for feature batch 3 (20261127000001_batch3.sql): club chat and
-- polls, drop-out suggestions, player-submitted results and reminders,
-- selection balance, away dates, the venue book and season awards.
-- Everything runs in a transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ------------------------------------------------------------------ test data
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'b3-cap@test.dev', '{"first_name":"Coco","surname":"Captain"}'),
  ('00000000-0000-0000-0000-0000000009b1', 'b3-p1@test.dev',  '{"first_name":"Pete","surname":"One"}'),
  ('00000000-0000-0000-0000-0000000009b2', 'b3-p2@test.dev',  '{"first_name":"Polly","surname":"Two"}'),
  ('00000000-0000-0000-0000-0000000009b3', 'b3-p3@test.dev',  '{"first_name":"Prem","surname":"Three"}'),
  ('00000000-0000-0000-0000-0000000009b4', 'b3-p4@test.dev',  '{"first_name":"Pax","surname":"Four"}'),
  ('00000000-0000-0000-0000-0000000009b5', 'b3-p5@test.dev',  '{"first_name":"Pim","surname":"Five"}'),
  ('00000000-0000-0000-0000-0000000009c1', 'b3-out@test.dev', '{"first_name":"Ola","surname":"Out"}');
insert into public.clubs (id, name, join_code) overriding system value values (9901, 'Batch Three Club', 'BATCH3'), (9902, 'Other Club', 'OTHER3');
insert into public.club_members (club_id, user_id, role) values
  (9901, '00000000-0000-0000-0000-0000000009a1', 'admin'),
  (9901, '00000000-0000-0000-0000-0000000009b1', 'member'),
  (9901, '00000000-0000-0000-0000-0000000009b2', 'member'),
  (9901, '00000000-0000-0000-0000-0000000009b3', 'member'),
  (9901, '00000000-0000-0000-0000-0000000009b4', 'member'),
  (9901, '00000000-0000-0000-0000-0000000009b5', 'member'),
  (9902, '00000000-0000-0000-0000-0000000009c1', 'admin');
insert into public.seasons (id, club_id, name, is_current) overriding system value values (9901, 9901, 'Now', true);
insert into public.squads (id, club_id, name, ranking, captain_id) overriding system value values
  (9901, 9901, 'Firsts', 1, '00000000-0000-0000-0000-0000000009a1');
insert into public.squad_players (user_id, squad_id)
select u, 9901 from unnest(array['00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009b1',
  '00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-0000000009b4',
  '00000000-0000-0000-0000-0000000009b5']::uuid[]) u;

-- 9911 upcoming (team picked), 9912 played yesterday (team picked, no result), 9913 played 10 days ago (result).
insert into public.fixtures (id, club_id, squad_id, season_id, opponent_name, fixture_date, start_time, location, is_home)
overriding system value values
  (9911, 9901, 9901, 9901, 'Next Opp',      current_date + 5,  '14:00', 'X', false),
  (9912, 9901, 9901, 9901, 'Yesterday Opp', current_date - 1,  '14:00', 'X', true),
  (9913, 9901, 9901, 9901, 'Earlier Opp',   current_date - 10, '14:00', 'X', true);
insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order)
select f, u, p, o
  from unnest(array[9911, 9912, 9913]) f,
       (values ('00000000-0000-0000-0000-0000000009a1'::uuid, 1, 1), ('00000000-0000-0000-0000-0000000009b1'::uuid, 1, 2),
               ('00000000-0000-0000-0000-0000000009b2'::uuid, 2, 1), ('00000000-0000-0000-0000-0000000009b3'::uuid, 2, 2)) t(u, p, o);
insert into public.availability (fixture_id, user_id, is_available)
select 9911, u, true from unnest(array['00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009b1',
  '00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-0000000009b5']::uuid[]) u;
insert into public.availability (fixture_id, user_id, is_available) values (9912, '00000000-0000-0000-0000-0000000009b1', true);
insert into public.matches (id, fixture_id, rubber_number, pair_number, opponent_pair_number, match_date, did_win,
                            sets_won, sets_lost, games_won, games_lost, set_1_won, set_1_lost, set_2_won, set_2_lost)
overriding system value values
  (9921, 9913, 1, 1, 1, current_date - 10, true,  2, 0, 12, 5, 6, 2, 6, 3),
  (9922, 9913, 2, 2, 2, current_date - 10, false, 0, 2,  5, 12, 2, 6, 3, 6);
insert into public.match_players (match_id, user_id, partner_user_id) values
  (9921, '00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009b1'),
  (9921, '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1'),
  (9922, '00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009b3'),
  (9922, '00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-0000000009b2');

create schema tests;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

-- ------------------------------------------------------------- result reminders (as the scheduler)
-- The job looks at every club, so set aside other clubs' fixtures for this check (rolled back).
delete from public.fixtures where club_id <> 9901;
select is(public.send_result_reminders(), 1, 'yesterday''s fixture without a result triggers one captain reminder');

set local role authenticated;

-- ------------------------------------------------------------- club chat and polls
select tests.login('00000000-0000-0000-0000-0000000009b1');
select lives_ok($$ insert into public.chat_messages (club_id, user_id, body) values (9901, auth.uid(), 'Anyone for a hit on Sunday?') $$,
  'a member can post in the club chat');
select throws_ok($$ insert into public.chat_messages (club_id, user_id, body, is_notice) values (9901, auth.uid(), 'Club notice', true) $$,
  '42501', null, 'a member cannot post a club notice');
select lives_ok($$ insert into public.chat_messages (club_id, user_id, body, poll) values (9901, auth.uid(), 'Social night?', '{"options":["Fri","Sat"]}') $$,
  'a member can create a poll');
select throws_ok($$ insert into public.chat_messages (club_id, user_id, body, poll) values (9901, auth.uid(), 'Bad poll', '{"options":["Only one"]}') $$,
  '23514', null, 'a poll needs at least two options');
select lives_ok($$ select public.vote_poll((select id from public.chat_messages where body = 'Social night?'), 1) $$, 'a member can vote');
select lives_ok($$ select public.vote_poll((select id from public.chat_messages where body = 'Social night?'), 0) $$, 'a member can change their vote');
select is((select count(*)::int from public.chat_poll_votes where user_id = auth.uid()), 1, 'changing a vote keeps one vote per person');
select throws_ok($$ select public.vote_poll((select id from public.chat_messages where body = 'Social night?'), 5) $$,
  'P0001', null, 'you cannot vote for an option that isn''t there');

select tests.login('00000000-0000-0000-0000-0000000009a1');
select lives_ok($$ insert into public.chat_messages (club_id, user_id, body, is_notice) values (9901, auth.uid(), 'AGM on Friday', true) $$,
  'an admin can post a club notice');
select lives_ok($$ insert into public.chat_messages (club_id, fixture_id, user_id, body, is_notice) values (9901, 9911, auth.uid(), 'Meet 13:00', true) $$,
  'the captain can post a fixture notice');

select tests.login('00000000-0000-0000-0000-0000000009c1');
select is((select count(*)::int from public.chat_messages where club_id = 9901), 0, 'another club cannot read the club chat');
select throws_ok($$ select public.vote_poll((select id from public.chat_messages where body = 'Social night?' limit 1), 0) $$,
  'P0001', null, 'another club cannot vote');

-- ------------------------------------------------------------- drop-out suggestion
select tests.login('00000000-0000-0000-0000-0000000009b1');
select is_empty($$ select * from public.suggest_replacement(9911) $$, 'a member cannot ask for a replacement');
select lives_ok($$ update public.availability set is_available = false, reason = 'Ill' where fixture_id = 9911 and user_id = auth.uid() $$,
  'a picked player can pull out (the captain is notified)');
select tests.login('00000000-0000-0000-0000-0000000009a1');
select is((select user_id from public.suggest_replacement(9911)), '00000000-0000-0000-0000-0000000009b5'::uuid,
  'the replacement is the available player who isn''t picked');

-- ------------------------------------------------------------- player-submitted results
select tests.login('00000000-0000-0000-0000-0000000009b4');
select throws_ok($$ select public.submit_result(9912, '[]') $$, 'P0001', 'Only players in the team can send the result',
  'a player outside the team cannot send the result');
select tests.login('00000000-0000-0000-0000-0000000009b1');
select throws_ok(
  $$ select public.submit_result(9912, '[
       {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000009a1","player_2":"00000000-0000-0000-0000-0000000009b1","set_1_won":6,"set_1_lost":5,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000009b2","player_2":"00000000-0000-0000-0000-0000000009b3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000009a1","player_2":"00000000-0000-0000-0000-0000000009b1","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000009b2","player_2":"00000000-0000-0000-0000-0000000009b3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1}]') $$,
  'P0001', null, 'an impossible score (6-5) is refused');
select lives_ok(
  $$ select public.submit_result(9912, '[
       {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000009a1","player_2":"00000000-0000-0000-0000-0000000009b1","set_1_won":6,"set_1_lost":4,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000009b2","player_2":"00000000-0000-0000-0000-0000000009b3","set_1_won":4,"set_1_lost":6,"set_2_won":6,"set_2_lost":3,"champ_tie":"W"},
       {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000009a1","player_2":"00000000-0000-0000-0000-0000000009b1","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000009b2","player_2":"00000000-0000-0000-0000-0000000009b3","set_1_won":2,"set_1_lost":6,"set_2_won":3,"set_2_lost":6}]') $$,
  'a player in the team can send the result');
select tests.login('00000000-0000-0000-0000-0000000009a1');
select is((select count(*)::int from public.result_submissions where fixture_id = 9912), 1, 'the captain sees the submitted result');
select lives_ok($$ select public.save_fixture_result(9912, (select matches from public.result_submissions where fixture_id = 9912)) $$,
  'the captain can save the submitted result as it is');
select is((select count(*)::int from public.result_submissions where fixture_id = 9912), 0, 'saving the result clears the submission');

-- ------------------------------------------------------------- selection balance
select is((select picked from public.selection_balance(9901) where user_id = '00000000-0000-0000-0000-0000000009b1'), 2,
  'selection balance counts times picked this season (fixtures played so far)');
select tests.login('00000000-0000-0000-0000-0000000009b2');
select is_empty($$ select * from public.selection_balance(9901) $$, 'a member cannot see the selection balance');

-- ------------------------------------------------------------- away dates
select tests.login('00000000-0000-0000-0000-0000000009b4');
select is(public.add_away_period(current_date + 1, current_date + 14, 'Holiday'), 1, 'away dates mark the fixtures in range as unavailable');
select is((select reason from public.availability where fixture_id = 9911 and user_id = auth.uid()), 'Away: Holiday', 'the reply says why');
select tests.login('00000000-0000-0000-0000-0000000009a1');
select lives_ok($$ select public.save_fixture(null, 9901, 'New Opp', current_date + 8, '10:00', 'Y', true, null, '', null) $$,
  'the captain adds a fixture inside someone''s away dates');
select is((select is_available from public.availability a join public.fixtures f on f.id = a.fixture_id
            where f.opponent_name = 'New Opp' and a.user_id = '00000000-0000-0000-0000-0000000009b4'), false,
  'a new fixture inside away dates is marked unavailable automatically');
select tests.login('00000000-0000-0000-0000-0000000009b3');
select is(public.add_away_period(current_date + 1, current_date + 6), 0, 'away dates never overwrite a reply the player already gave');
select tests.login('00000000-0000-0000-0000-0000000009b4');
select lives_ok($$ delete from public.away_periods where user_id = auth.uid() $$, 'a player can remove their away dates');
select is((select count(*)::int from public.availability where user_id = auth.uid() and source = 'away'), 0,
  'removing away dates clears the automatic replies');

-- ------------------------------------------------------------- venue book
select throws_ok($$ insert into public.venues (club_id, name, address) values (9901, 'Nope TC', 'Somewhere') $$,
  '42501', null, 'a member cannot edit the venue book');
select tests.login('00000000-0000-0000-0000-0000000009a1');
select lives_ok($$ insert into public.venues (club_id, name, address, notes) values (9901, 'Oakwood TC', 'Park Lane', 'Parking behind the clubhouse') $$,
  'a captain can add a venue');
select throws_ok($$ insert into public.venues (club_id, name, address) values (9901, ' oakwood tc ', 'Elsewhere') $$,
  '23505', null, 'the same venue cannot be added twice');

-- ------------------------------------------------------------- season awards
select ok((public.season_awards(9901) -> 0 -> 'awards') @> '[{"title":"Most wins"}]', 'season awards include Most wins');
select ok((public.season_awards(9901) -> 0 -> 'awards') @> '[{"title":"Best partnership","winner":"Coco & Pete"}]',
  'Best partnership goes to the pair that won all 3 of their rubbers (not the pair that won 1 of 3)');
select tests.login('00000000-0000-0000-0000-0000000009b2');
select throws_ok($$ select public.season_awards(9901) $$, 'P0001', null, 'a member cannot see the season awards');

select * from finish();
rollback;
