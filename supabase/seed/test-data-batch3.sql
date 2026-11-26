-- Sample data for feature batch 3, added on top of the main sample and its
-- extras (run by `npm run db:seed`; removed by `npm run db:unseed`). Stops if
-- it's already loaded.
--   * club chat: an admin notice, two messages and a poll with votes
--   * venue book: Northfield and Hillside Park
--   * Will is away for the last sample fixture
--   * James pulls out of the Northfield fixture (drop-out banner + suggestion)
--   * a fixture played yesterday with scores sent by James, waiting for you
begin;

do $$
declare
  v_admin uuid;
  v_club  bigint;
  v_sq1   bigint;
  v_poll  bigint;
  v_next  bigint;
  v_yday  bigint;
  v_last  date;
  v_tag   constant text := 'Sample fixture (test data)';
  u       jsonb;
begin
  select jsonb_object_agg(p.first_name, p.id) into u
    from auth.users au join public.profiles p on p.id = au.id
   where au.email like '%@teamsheet.test';
  if u is null then
    raise exception 'Load the main sample first (npm run db:seed).';
  end if;
  if exists (select 1 from public.venues where name = 'Northfield' and updated_by is null) then
    raise notice 'Batch 3 sample data is already loaded.';
    return;
  end if;

  select m.user_id, m.club_id into v_admin, v_club
    from public.club_members m where m.role = 'admin' order by m.joined_at limit 1;
  select id into v_sq1 from public.squads where club_id = v_club order by ranking limit 1;

  -- Club chat
  insert into public.chat_messages (club_id, user_id, body, is_notice, created_at) values
    (v_club, v_admin, 'Club AGM on Wednesday 10 December, 7pm in the clubhouse. All welcome.', true, now() - interval '2 days'),
    (v_club, (u ->> 'Sam')::uuid, 'Courts 3 and 4 have been resurfaced. They look great!', false, now() - interval '30 hours'),
    (v_club, (u ->> 'Jack')::uuid, 'Anyone up for a hit on Sunday morning?', false, now() - interval '20 hours');
  insert into public.chat_messages (club_id, user_id, body, poll, created_at)
  values (v_club, (u ->> 'Oliver')::uuid, 'Christmas social: which night works?',
          '{"options": ["Friday 12 December", "Saturday 13 December", "Friday 19 December"]}', now() - interval '6 hours')
  returning id into v_poll;
  insert into public.chat_poll_votes (message_id, user_id, option) values
    (v_poll, (u ->> 'Oliver')::uuid, 1), (v_poll, (u ->> 'James')::uuid, 1), (v_poll, (u ->> 'Tom')::uuid, 0),
    (v_poll, (u ->> 'Harry')::uuid, 1), (v_poll, (u ->> 'Dan')::uuid, 2);

  -- Venue book (updated_by null marks sample venues)
  insert into public.venues (club_id, name, address, notes) values
    (v_club, 'Northfield', 'Northfield Tennis Centre, Court Lane',
     'Free parking on Court Lane. Hard courts: bring non-marking shoes.'),
    (v_club, 'Hillside Park', 'Hillside Park, Park Road',
     'Pay-and-display car park. Clubhouse code 2468. Courts 5 and 6 are by the river.');

  -- Will is away for the last sample fixture
  select max(fixture_date) into v_last from public.fixtures where notes like v_tag || '%' and squad_id = v_sq1;
  if v_last is not null then
    insert into public.away_periods (user_id, starts_on, ends_on, note)
    values ((u ->> 'Will')::uuid, v_last - 2, v_last + 3, 'Skiing');
    perform public.apply_away((u ->> 'Will')::uuid, v_last - 2, v_last + 3, 'Skiing');
  end if;

  -- James pulls out of the next away fixture (he's picked for it)
  select id into v_next from public.fixtures
   where notes like v_tag || '%' and squad_id = v_sq1 and not is_home and fixture_date >= current_date
   order by fixture_date limit 1;
  if v_next is not null then
    update public.availability set is_available = false, reason = 'Work trip'
     where fixture_id = v_next and user_id = (u ->> 'James')::uuid;
  end if;

  -- A fixture played yesterday, with scores sent by James for the captain to check
  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, team_selected_at, notes)
  select v_club, v_sq1, s.id, sq.division_id, v_admin, 'St Mary''s LTC', current_date - 1, '14:00',
         'St Mary''s LTC courts', false, now() - interval '4 days', v_tag
    from public.seasons s, public.squads sq where s.club_id = v_club and s.is_current and sq.id = v_sq1
  returning id into v_yday;
  insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order) values
    (v_yday, v_admin, 1, 1), (v_yday, (u ->> 'James')::uuid, 1, 2),
    (v_yday, (u ->> 'Harry')::uuid, 2, 1), (v_yday, (u ->> 'Sam')::uuid, 2, 2);
  insert into public.result_submissions (fixture_id, submitted_by, matches) values (v_yday, (u ->> 'James')::uuid,
    jsonb_build_array(
      jsonb_build_object('rubber_number', 1, 'player_1', v_admin, 'player_2', u ->> 'James', 'set_1_won', 6, 'set_1_lost', 3, 'set_2_won', 6, 'set_2_lost', 4, 'champ_tie', null),
      jsonb_build_object('rubber_number', 2, 'player_1', u ->> 'Harry', 'player_2', u ->> 'Sam', 'set_1_won', 4, 'set_1_lost', 6, 'set_2_won', 6, 'set_2_lost', 2, 'champ_tie', 'W'),
      jsonb_build_object('rubber_number', 3, 'player_1', v_admin, 'player_2', u ->> 'James', 'set_1_won', 7, 'set_1_lost', 5, 'set_2_won', 6, 'set_2_lost', 3, 'champ_tie', null),
      jsonb_build_object('rubber_number', 4, 'player_1', u ->> 'Harry', 'player_2', u ->> 'Sam', 'set_1_won', 3, 'set_1_lost', 6, 'set_2_won', 4, 'set_2_lost', 6, 'champ_tie', null)));

  raise notice 'Loaded batch 3 sample data (club chat, poll, venues, away dates, drop-out, sent result).';
end;
$$;

commit;
