-- pgTAP tests for feature batch 2 (20261126000001_batch2.sql): lifts, fixture
-- messages, match fees, profile photo paths, invites and the season report.
-- Everything runs in a transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ------------------------------------------------------------------ test data
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'b2-cap@test.dev',   '{"first_name":"Cleo","surname":"Captain"}'),
  ('00000000-0000-0000-0000-0000000007b1', 'b2-p1@test.dev',    '{"first_name":"Dan","surname":"Driver"}'),
  ('00000000-0000-0000-0000-0000000007b2', 'b2-p2@test.dev',    '{"first_name":"Pia","surname":"Passenger"}'),
  ('00000000-0000-0000-0000-0000000007b3', 'b2-p3@test.dev',    '{"first_name":"Rae","surname":"Rider"}'),
  ('00000000-0000-0000-0000-0000000007c1', 'b2-out@test.dev',   '{"first_name":"Olly","surname":"Outsider"}'),
  ('00000000-0000-0000-0000-0000000007d1', 'b2-new@test.dev',   '{"first_name":"Nia","surname":"Newcomer"}');

insert into public.clubs (id, name, join_code) overriding system value values
  (9701, 'Batch Club A', 'BATCHA'), (9702, 'Batch Club B', 'BATCHB');
insert into public.club_members (club_id, user_id, role) values
  (9701, '00000000-0000-0000-0000-0000000007a1', 'admin'),
  (9701, '00000000-0000-0000-0000-0000000007b1', 'member'),
  (9701, '00000000-0000-0000-0000-0000000007b2', 'member'),
  (9701, '00000000-0000-0000-0000-0000000007b3', 'member'),
  (9702, '00000000-0000-0000-0000-0000000007c1', 'admin');
insert into public.seasons (id, club_id, name, is_current) overriding system value values (9701, 9701, 'Now', true);
insert into public.squads (id, club_id, name, ranking, captain_id) overriding system value values
  (9701, 9701, 'Firsts', 1, '00000000-0000-0000-0000-0000000007a1'),
  (9702, 9701, 'Seconds', 2, null);
insert into public.squad_players (user_id, squad_id) values
  ('00000000-0000-0000-0000-0000000007a1', 9701),
  ('00000000-0000-0000-0000-0000000007b1', 9701),
  ('00000000-0000-0000-0000-0000000007b2', 9701),
  ('00000000-0000-0000-0000-0000000007b3', 9701);
insert into public.fixtures (id, club_id, squad_id, season_id, opponent_name, fixture_date, start_time, location, is_home, match_fee_pence)
overriding system value values
  (9801, 9701, 9701, 9701, 'Away Opp',  current_date + 4,  '14:00', 'There', false, null),
  (9802, 9701, 9701, 9701, 'Past Opp',  current_date - 7,  '14:00', 'Here',  true,  500);
insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order) values
  (9802, '00000000-0000-0000-0000-0000000007a1', 1, 1), (9802, '00000000-0000-0000-0000-0000000007b1', 1, 2),
  (9802, '00000000-0000-0000-0000-0000000007b2', 2, 1), (9802, '00000000-0000-0000-0000-0000000007b3', 2, 2);
insert into public.matches (id, fixture_id, rubber_number, pair_number, opponent_pair_number, match_date, did_win,
                            sets_won, sets_lost, games_won, games_lost, set_1_won, set_1_lost, set_2_won, set_2_lost)
overriding system value values
  (9901, 9802, 1, 1, 1, current_date - 7, true, 2, 0, 12, 5, 6, 2, 6, 3);
insert into public.match_players (match_id, user_id, partner_user_id) values
  (9901, '00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1'),
  (9901, '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007a1');

create schema tests;
create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.login(uuid) to authenticated;

set local role authenticated;

-- ------------------------------------------------------------- lifts
select tests.login('00000000-0000-0000-0000-0000000007b1');
select lives_ok($$ select public.set_my_lift(9801, 'offer', 1, 'Leaving 13:00') $$, 'a player can offer a lift');
select throws_ok($$ select public.set_my_lift(9801, 'offer', 0) $$, 'P0001', null, 'a lift needs at least one seat');
select throws_ok($$ select public.set_my_lift(9802, 'need') $$, 'P0001', null, 'no lifts for fixtures already played');
select throws_ok($$ insert into public.fixture_lifts (fixture_id, user_id, kind, seats) values (9801, auth.uid(), 'offer', 4) $$,
  '42501', null, 'lifts cannot be written to the table directly');

select tests.login('00000000-0000-0000-0000-0000000007b2');
select lives_ok($$ select public.set_my_lift(9801, 'need') $$, 'a player can ask for a lift');
select tests.login('00000000-0000-0000-0000-0000000007b3');
select lives_ok($$ select public.set_my_lift(9801, 'need') $$, 'a second player can ask for a lift');

select tests.login('00000000-0000-0000-0000-0000000007b1');
select lives_ok($$ select public.take_passenger(9801, '00000000-0000-0000-0000-0000000007b2') $$, 'a driver can take a passenger');
select throws_ok($$ select public.take_passenger(9801, '00000000-0000-0000-0000-0000000007b3') $$, 'P0001', 'Your car is full',
  'a driver cannot take more passengers than seats');
select is((select seats_taken from public.lift_board(9801) where user_id = '00000000-0000-0000-0000-0000000007b1'), 1,
  'the lift board shows seats taken');

select tests.login('00000000-0000-0000-0000-0000000007b3');
select throws_ok($$ select public.drop_passenger(9801, '00000000-0000-0000-0000-0000000007b2') $$, 'P0001', null,
  'someone else cannot cancel another player''s lift');
select tests.login('00000000-0000-0000-0000-0000000007b2');
select lives_ok($$ select public.drop_passenger(9801, '00000000-0000-0000-0000-0000000007b2') $$, 'a passenger can cancel their lift');
select is((select driver_id from public.lift_board(9801) where user_id = '00000000-0000-0000-0000-0000000007b2'), null::uuid,
  'after cancelling, the passenger needs a lift again');

select tests.login('00000000-0000-0000-0000-0000000007b1');
select public.take_passenger(9801, '00000000-0000-0000-0000-0000000007b2');
select lives_ok($$ select public.set_my_lift(9801, null) $$, 'a driver can withdraw their offer');
select is((select driver_id from public.lift_board(9801) where user_id = '00000000-0000-0000-0000-0000000007b2'), null::uuid,
  'withdrawing an offer frees its passengers');

select tests.login('00000000-0000-0000-0000-0000000007c1');
select is_empty($$ select * from public.lift_board(9801) $$, 'another club cannot see the lifts');
select throws_ok($$ select public.set_my_lift(9801, 'need') $$, 'P0001', null, 'another club cannot ask for a lift');

-- ------------------------------------------------------------- messages
select tests.login('00000000-0000-0000-0000-0000000007b1');
select lives_ok($$ insert into public.chat_messages (club_id, fixture_id, user_id, body) values (9701, 9801, auth.uid(), 'Who''s bringing balls?') $$,
  'a member can post in the fixture chat');
select throws_ok($$ insert into public.chat_messages (club_id, fixture_id, user_id, body, is_notice) values (9701, 9801, auth.uid(), 'Notice!', true) $$,
  '42501', null, 'a member cannot post a notice');
select throws_ok($$ insert into public.chat_messages (club_id, fixture_id, user_id, body) values (9701, 9801, '00000000-0000-0000-0000-0000000007b2', 'Fake') $$,
  '42501', null, 'nobody can post as someone else');

select tests.login('00000000-0000-0000-0000-0000000007a1');
select lives_ok($$ insert into public.chat_messages (club_id, fixture_id, user_id, body, is_notice) values (9701, 9801, auth.uid(), 'Meet at 13:15', true) $$,
  'the captain can post a notice');
select is((select count(*)::int from public.chat_messages where fixture_id = 9801), 2, 'the club sees both messages');
select lives_ok($$ delete from public.chat_messages where body = 'Who''s bringing balls?' $$, 'the captain can remove a message');

select tests.login('00000000-0000-0000-0000-0000000007c1');
select is((select count(*)::int from public.chat_messages where fixture_id = 9801), 0, 'another club cannot read the chat');

-- ------------------------------------------------------------- match fees
select tests.login('00000000-0000-0000-0000-0000000007b1');
select throws_ok($$ select public.set_fee_paid(9802, auth.uid(), true) $$, 'P0001', null, 'a player cannot mark themselves as paid');
select is((select count(*)::int from public.fixture_fees(9802)), 1, 'a player only sees their own fee');
select is((select fee_pence from public.my_fees() where fixture_id = 9802), 500, 'my_fees lists the fee for a fixture I played');

select tests.login('00000000-0000-0000-0000-0000000007a1');
select is((select count(*)::int from public.fixture_fees(9802)), 4, 'the captain sees every selected player''s fee');
select lives_ok($$ select public.set_fee_paid(9802, '00000000-0000-0000-0000-0000000007b1', true) $$, 'the captain can record a payment');
select throws_ok($$ select public.set_fee_paid(9802, '00000000-0000-0000-0000-0000000007c1', true) $$, 'P0001', null,
  'only selected players can be marked as paid');
select is((select sum(amount_pence)::int from public.squad_fees_outstanding(9701)), 1500, 'outstanding fees leave out the paid player');
select lives_ok($$ select public.set_fixture_fee(9801, 750) $$, 'the captain can set a fixture''s fee');

-- ------------------------------------------------------------- photos
select tests.login('00000000-0000-0000-0000-0000000007b1');
select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000007b2/x.jpg' where id = auth.uid() $$,
  '23514', null, 'a photo path must be in the player''s own folder');

-- ------------------------------------------------------------- invites
select throws_ok($$ select public.import_invites('[{"email":"x@y.dev"}]') $$, 'P0001', null, 'a member cannot import players');

select tests.login('00000000-0000-0000-0000-0000000007a1');
select is(public.import_invites('[{"email":" B2-New@test.dev ","first_name":"Nia","surname":"Newcomer","squad_id":9702},
                                  {"email":"b2-p1@test.dev"},{"email":"not-an-email"}]'),
  '{"added": 1, "updated": 0, "invalid": 1, "already_members": 1}'::jsonb,
  'import adds new emails, skips members and invalid rows');

select tests.login('00000000-0000-0000-0000-0000000007d1');
select is((select club_name from public.my_invites()), 'Batch Club A', 'the invited person sees their invite');
select lives_ok($$ select public.accept_invite((select invite_id from public.my_invites())) $$, 'the invited person can accept');
select is((select squad_id from public.squad_players where user_id = auth.uid()), 9702::bigint, 'accepting puts them in the invited squad');

-- ------------------------------------------------------------- season report
select tests.login('00000000-0000-0000-0000-0000000007a1');
select is((public.season_report(9701) -> 'squads' -> 0 -> 'players' -> 0 ->> 'wins')::int, 1, 'the season report counts wins');

select * from finish();
rollback;
