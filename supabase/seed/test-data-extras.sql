-- Sample data for feature batch 2, added on top of test-data.sql (run by
-- `npm run db:seed` after it; removed by `npm run db:unseed`). Safe to run once
-- on an existing sample: it stops if the extras are already there.
--   * £5 match fees on the sample 1st-team fixtures, mostly paid (you owe on two)
--   * a captain's notice and a short chat on the next away fixture
--   * lifts for that fixture: Oliver driving Tom, James still needs a lift
--   * two pending invites (Import players)
--   * Dan (2nd team) borrowed to play up for the Hillside fixture
begin;

do $$
declare
  v_admin  uuid;
  v_club   bigint;
  v_next   bigint;   -- next away fixture (Northfield)
  v_later  bigint;   -- Hillside, in 17 days
  v_sq1    bigint;
  v_sq2    bigint;
  v_tag    constant text := 'Sample fixture (test data)';
  u        jsonb;    -- sample players by first name
begin
  select jsonb_object_agg(p.first_name, p.id) into u
    from auth.users au join public.profiles p on p.id = au.id
   where au.email like '%@teamsheet.test';
  if u is null then
    raise exception 'Load the main sample first (npm run db:seed).';
  end if;
  if exists (select 1 from public.fixture_messages m join public.fixtures f on f.id = m.fixture_id
              where f.notes like v_tag || '%') then
    raise notice 'Batch 2 sample data is already loaded.';
    return;
  end if;

  select m.user_id, m.club_id into v_admin, v_club
    from public.club_members m where m.role = 'admin' order by m.joined_at limit 1;
  select id into v_sq1 from public.squads where club_id = v_club order by ranking limit 1;
  select squad_id into v_sq2 from public.squad_players where user_id = (u ->> 'Dan')::uuid;
  select id into v_next from public.fixtures
   where notes like v_tag || '%' and squad_id = v_sq1 and not is_home and fixture_date >= current_date
   order by fixture_date limit 1;
  select id into v_later from public.fixtures
   where notes like v_tag || '%' and squad_id = v_sq1 and opponent_name = 'Hillside Park A' and fixture_date >= current_date;

  -- Match fees: £5 on every sample 1st-team fixture; everyone has paid except you on the last two played.
  update public.fixtures set match_fee_pence = 500 where notes like v_tag || '%' and squad_id = v_sq1;
  insert into public.fixture_fee_payments (fixture_id, user_id, marked_by, paid_at)
  select t.fixture_id, t.user_id, v_admin, f.fixture_date + 1
    from public.team_selection_players t join public.fixtures f on f.id = t.fixture_id
   where f.notes like v_tag || '%' and f.squad_id = v_sq1 and f.fixture_date < current_date
     and not (t.user_id = v_admin and f.fixture_date >= current_date - 15);

  -- Notice and chat on the next away fixture.
  if v_next is not null then
    insert into public.fixture_messages (fixture_id, user_id, body, is_notice, created_at) values
      (v_next, v_admin, 'Meet in the club car park at 13:15. Bring two new tubes of balls, please.', true, now() - interval '5 hours'),
      (v_next, (u ->> 'Oliver')::uuid, 'I can take three. Leaving at 13:00 sharp.', false, now() - interval '4 hours'),
      (v_next, (u ->> 'Tom')::uuid, 'Thanks Oliver, put me down.', false, now() - interval '3 hours'),
      (v_next, (u ->> 'James')::uuid, 'Is anyone going from the station side?', false, now() - interval '1 hour');

    insert into public.fixture_lifts (fixture_id, user_id, kind, seats, note, driver_id) values
      (v_next, (u ->> 'Oliver')::uuid, 'offer', 3, 'Leaving the club at 13:00', null),
      (v_next, (u ->> 'Tom')::uuid, 'need', null, null, (u ->> 'Oliver')::uuid),
      (v_next, (u ->> 'James')::uuid, 'need', null, 'Near the station', null);
  end if;

  -- Pending invites.
  insert into public.club_invites (club_id, email, first_name, surname, squad_id, invited_by) values
    (v_club, 'alex.morgan@teamsheet.test', 'Alex', 'Morgan', v_sq2, v_admin),
    (v_club, 'priya.shah@teamsheet.test', 'Priya', 'Shah', v_sq1, v_admin);

  -- Dan plays up for the Hillside fixture (1 of his 2 this season).
  if v_later is not null then
    insert into public.fixture_borrowed_players (fixture_id, user_id, from_squad_id, borrowed_by)
    values (v_later, (u ->> 'Dan')::uuid, v_sq2, v_admin);
    insert into public.availability (fixture_id, user_id, is_available)
    values (v_later, (u ->> 'Dan')::uuid, true)
    on conflict (fixture_id, user_id) do update set is_available = true;
  end if;

  raise notice 'Loaded batch 2 sample data (fees, chat, lifts, invites, playing up).';
end;
$$;

commit;
