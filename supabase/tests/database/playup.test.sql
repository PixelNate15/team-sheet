-- pgTAP tests for playing up (20261126000002_play_up.sql): borrowing a player
-- from a lower team, at most twice per player per season, and team selection
-- limited to the team plus borrowed players. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ------------------------------------------------------------------ test data
-- Club with a 1st team (captain + 2 players) and a 2nd team (3 players).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008a1', 'pu-cap@test.dev', '{"first_name":"Cass","surname":"Captain"}'),
  ('00000000-0000-0000-0000-0000000008a2', 'pu-a2@test.dev',  '{"first_name":"Ash","surname":"Two"}'),
  ('00000000-0000-0000-0000-0000000008a3', 'pu-a3@test.dev',  '{"first_name":"Avi","surname":"Three"}'),
  ('00000000-0000-0000-0000-0000000008b1', 'pu-b1@test.dev',  '{"first_name":"Bea","surname":"Below"}'),
  ('00000000-0000-0000-0000-0000000008b2', 'pu-b2@test.dev',  '{"first_name":"Bo","surname":"Below"}'),
  ('00000000-0000-0000-0000-0000000008b3', 'pu-b3@test.dev',  '{"first_name":"Bex","surname":"Below"}');
insert into public.clubs (id, name, join_code) overriding system value values (9811, 'Play Up Club', 'PLAYUP');
insert into public.club_members (club_id, user_id, role) values
  (9811, '00000000-0000-0000-0000-0000000008a1', 'member'),
  (9811, '00000000-0000-0000-0000-0000000008a2', 'member'),
  (9811, '00000000-0000-0000-0000-0000000008a3', 'member'),
  (9811, '00000000-0000-0000-0000-0000000008b1', 'member'),
  (9811, '00000000-0000-0000-0000-0000000008b2', 'member'),
  (9811, '00000000-0000-0000-0000-0000000008b3', 'member');
insert into public.seasons (id, club_id, name, is_current) overriding system value values
  (9811, 9811, 'This season', true), (9812, 9811, 'Last season', false);
insert into public.squads (id, club_id, name, ranking, captain_id) overriding system value values
  (9811, 9811, 'Firsts', 1, '00000000-0000-0000-0000-0000000008a1'),
  (9812, 9811, 'Seconds', 2, '00000000-0000-0000-0000-0000000008b1');
insert into public.squad_players (user_id, squad_id) values
  ('00000000-0000-0000-0000-0000000008a1', 9811), ('00000000-0000-0000-0000-0000000008a2', 9811),
  ('00000000-0000-0000-0000-0000000008a3', 9811),
  ('00000000-0000-0000-0000-0000000008b1', 9812), ('00000000-0000-0000-0000-0000000008b2', 9812),
  ('00000000-0000-0000-0000-0000000008b3', 9812);
-- Four upcoming 1st-team fixtures this season, plus one played last season.
insert into public.fixtures (id, club_id, squad_id, season_id, opponent_name, fixture_date, start_time, location, is_home)
overriding system value values
  (9821, 9811, 9811, 9811, 'Opp 1', current_date + 2,  '14:00', 'X', true),
  (9822, 9811, 9811, 9811, 'Opp 2', current_date + 9,  '14:00', 'X', true),
  (9823, 9811, 9811, 9811, 'Opp 3', current_date + 16, '14:00', 'X', true),
  (9824, 9811, 9811, 9811, 'Opp 4', current_date + 23, '14:00', 'X', true),
  (9825, 9811, 9812, 9811, 'Opp 5', current_date + 2,  '14:00', 'X', true);
-- The 1st team has 3 available for each fixture, so they're one short.
insert into public.availability (fixture_id, user_id, is_available)
select f, u, true
  from unnest(array[9821, 9822, 9823, 9824]) f,
       unnest(array['00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008a2',
                    '00000000-0000-0000-0000-0000000008a3']::uuid[]) u;

create schema tests;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008a1');

-- ------------------------------------------------------------- selection rule
select throws_ok(
  $$ select public.save_fixture(9821, 9811, 'Opp 1', current_date + 2, '14:00', 'X', true, null, '',
       '[{"user_id":"00000000-0000-0000-0000-0000000008a1","pair_number":1,"selection_order":1},
         {"user_id":"00000000-0000-0000-0000-0000000008b1","pair_number":1,"selection_order":2}]'::jsonb) $$,
  'P0001', null, 'a captain cannot pick a lower-team player without borrowing them');

-- ------------------------------------------------------------- borrowing
select is((select count(*)::int from public.borrowable_players(9821)), 3, 'the 2nd team''s players can be borrowed');
select lives_ok($$ select public.borrow_player(9821, '00000000-0000-0000-0000-0000000008b1') $$, 'a short captain can borrow a player');
select throws_ok($$ select public.borrow_player(9821, '00000000-0000-0000-0000-0000000008b2') $$, 'P0001',
  'You already have 4 available players for this fixture', 'no borrowing once the team has 4 available');
select lives_ok(
  $$ select public.save_fixture(9821, 9811, 'Opp 1', current_date + 2, '14:00', 'X', true, null, '',
       '[{"user_id":"00000000-0000-0000-0000-0000000008a1","pair_number":1,"selection_order":1},
         {"user_id":"00000000-0000-0000-0000-0000000008a2","pair_number":1,"selection_order":2},
         {"user_id":"00000000-0000-0000-0000-0000000008a3","pair_number":2,"selection_order":1},
         {"user_id":"00000000-0000-0000-0000-0000000008b1","pair_number":2,"selection_order":2}]'::jsonb) $$,
  'a borrowed player can be picked for that fixture');
select is((select borrowed_from from public.fixture_availability(9821) where user_id = '00000000-0000-0000-0000-0000000008b1'),
  'Seconds', 'the replies list shows who is borrowed and from which team');

select lives_ok($$ select public.borrow_player(9822, '00000000-0000-0000-0000-0000000008b1') $$, 'the same player can play up a second time');
select throws_ok($$ select public.borrow_player(9823, '00000000-0000-0000-0000-0000000008b1') $$, 'P0001',
  'Bea Below has already played up twice this season', 'a third time in one season is refused');
select is((select limit_reached from public.borrowable_players(9823) where user_id = '00000000-0000-0000-0000-0000000008b1'), true,
  'the borrow list shows the limit is reached');
select lives_ok($$ select public.borrow_player(9823, '00000000-0000-0000-0000-0000000008b2') $$, 'another lower-team player can still be borrowed');

select lives_ok($$ select public.release_borrowed_player(9822, '00000000-0000-0000-0000-0000000008b1') $$, 'a borrow can be undone before the match');
select lives_ok($$ select public.borrow_player(9824, '00000000-0000-0000-0000-0000000008b1') $$, 'undoing a borrow frees it up again');

-- Only from lower teams, only by the right captain.
select tests.login('00000000-0000-0000-0000-0000000008b1');
select throws_ok($$ select public.borrow_player(9825, '00000000-0000-0000-0000-0000000008a2') $$, 'P0001',
  'You can only borrow players from a lower team', 'a lower team cannot borrow from a higher one');
select throws_ok($$ select public.borrow_player(9821, '00000000-0000-0000-0000-0000000008b2') $$, 'P0001', null,
  'only the team''s captain can borrow for it');

-- The borrowed player sees the fixture and can reply.
select ok(exists (select 1 from public.my_fixtures() where id = 9821 and is_borrowed), 'the borrowed player sees the fixture');
select lives_ok(
  $$ insert into public.availability (fixture_id, user_id, is_available) values (9821, auth.uid(), false)
     on conflict (fixture_id, user_id) do update set is_available = excluded.is_available $$,
  'the borrowed player can change their availability');

-- Results can't include a lower-team player who wasn't borrowed.
reset role;
update public.fixtures set fixture_date = current_date - 1 where id = 9823;
set local role authenticated;
select tests.login('00000000-0000-0000-0000-0000000008a1');
select throws_ok(
  $$ select public.save_fixture_result(9823, '[
       {"rubber_number":1,"player_1":"00000000-0000-0000-0000-0000000008a1","player_2":"00000000-0000-0000-0000-0000000008b3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":2,"player_1":"00000000-0000-0000-0000-0000000008a2","player_2":"00000000-0000-0000-0000-0000000008a3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":3,"player_1":"00000000-0000-0000-0000-0000000008a1","player_2":"00000000-0000-0000-0000-0000000008b3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1},
       {"rubber_number":4,"player_1":"00000000-0000-0000-0000-0000000008a2","player_2":"00000000-0000-0000-0000-0000000008a3","set_1_won":6,"set_1_lost":1,"set_2_won":6,"set_2_lost":1}]'::jsonb) $$,
  'P0001', null, 'a result cannot include a lower-team player who wasn''t borrowed');

select * from finish();
rollback;
