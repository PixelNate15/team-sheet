-- Sample data for trying the app: `npm run db:seed`. Remove it with `npm run db:unseed`.
--
-- Adds to the first club's admin (you):
--   * 13 made-up players (emails @teamsheet.test; they can't sign in)
--   * your squad filled to 8, plus a "2nd Team" squad in a new "Division 2"
--   * 6 played fixtures with full results, entered through save_fixture_result
--     as the admin, so form scores and records are calculated exactly as in the app
--   * partner feedback, one rating per partner per fixture (two still waiting for you)
--   * 4 upcoming fixtures: one with the team picked (you're in it), one waiting
--     for your reply, two further out
--   * a current injury, availability replies, and Division 1's league table
--
-- Everything runs in one transaction: if any step fails, nothing is saved.
begin;

do $$
declare
  v_club      bigint;
  v_club_name text;
  v_admin     uuid;
  v_season    bigint;
  v_div1      bigint;
  v_div2      bigint;
  v_sq1       bigint;
  v_sq2       bigint;
  v_first     text[] := array['James','Oliver','Harry','Tom','Sam','Ben','Will','Jack','Dan','Luke','Chris','Matt','Rob'];
  v_last      text[] := array['Carter','Hughes','Patel','Reid','Okafor','Morgan','Fletcher','Shaw','Bennett','Doyle','Kerr','Ellis','Grant'];
  p           uuid[] := '{}';   -- p[1..13], the made-up players
  v_id        uuid;
  v_fx        bigint;
  v_fixtures  bigint[] := '{}';
  v_sel       uuid[];
  r           record;
  i           int;
  v_tag       constant text := 'Sample fixture (test data)';
begin
  if exists (select 1 from auth.users where email like '%@teamsheet.test') then
    raise exception 'Test data is already loaded. Run "npm run db:unseed" first.';
  end if;

  select m.club_id, m.user_id, c.name into v_club, v_admin, v_club_name
    from public.club_members m join public.clubs c on c.id = m.club_id
   where m.role = 'admin' order by m.joined_at limit 1;
  if v_club is null then
    raise exception 'No club yet: create one in the app first.';
  end if;

  -- Act as the admin for the app's own functions (auth.uid()).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Season, squad 1 and its division (create them if the club is brand new).
  select id into v_season from public.seasons where club_id = v_club and is_current limit 1;
  if v_season is null then
    insert into public.seasons (club_id, name, is_current) values (v_club, 'Current season', true) returning id into v_season;
  end if;
  select id, division_id into v_sq1, v_div1 from public.squads where club_id = v_club order by ranking limit 1;
  if v_sq1 is null then
    insert into public.squads (club_id, name, ranking, captain_id) values (v_club, '1st Team', 1, v_admin) returning id into v_sq1;
  end if;
  if v_div1 is null then
    insert into public.divisions (club_id, name, team_count) values (v_club, 'Division 1', 8) returning id into v_div1;
    update public.squads set division_id = v_div1 where id = v_sq1;
  end if;
  insert into public.squad_players (user_id, squad_id) values (v_admin, v_sq1) on conflict (user_id) do nothing;

  -- Made-up players (no password, so nobody can sign in as them).
  for i in 1 .. array_length(v_first, 1) loop
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      lower(v_first[i] || '.' || v_last[i]) || '@teamsheet.test', '', now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', v_first[i], 'surname', v_last[i]),
      now(), now(), '', '', '', '');
    insert into public.club_members (club_id, user_id, role) values (v_club, v_id, 'member');
    p := p || v_id;
  end loop;

  -- Squad 1: you + players 1-7. Squad 2: players 8-13, captained by player 8.
  insert into public.squad_players (user_id, squad_id) select unnest(p[1:7]), v_sq1;
  insert into public.divisions (club_id, name, team_count) values (v_club, 'Division 2', 8) returning id into v_div2;
  insert into public.squads (club_id, name, ranking, division_id, captain_id)
  values (v_club, '2nd Team', (select max(ranking) + 1 from public.squads where club_id = v_club), v_div2, p[8])
  returning id into v_sq2;
  insert into public.squad_players (user_id, squad_id) select unnest(p[8:13]), v_sq2;

  -- Division 1 league table (updated_by null marks these rows as sample data).
  insert into public.league_table_rows (division_id, season_id, position, team_name, played, points, is_own_team) values
    (v_div1, v_season, 1, 'Riverside LTC A', 7, 52, false),
    (v_div1, v_season, 2, 'Oakwood TC', 7, 47, false),
    (v_div1, v_season, 3, v_club_name, 6, 41, true),
    (v_div1, v_season, 4, 'Hillside Park A', 7, 38, false),
    (v_div1, v_season, 5, 'St Mary''s LTC', 6, 30, false),
    (v_div1, v_season, 6, 'Meadowbank TC', 7, 27, false),
    (v_div1, v_season, 7, 'Castle Green LTC', 7, 19, false),
    (v_div1, v_season, 8, 'Northfield B', 7, 12, false);

  -- ---------------------------------------------------------------
  -- Played fixtures: days ago, opponent, home?, pair 1 (a, b), pair 2 (c, d), sets per rubber
  -- Rubbers 1 and 3 are pair 1; rubbers 2 and 4 are pair 2.
  -- ---------------------------------------------------------------
  for r in
    select * from (values
      (42, 'Oakwood TC', false, v_admin, p[1], p[2], p[3],
       '[[6,4,6,3,null],[3,6,6,4,"W"],[4,6,6,7,null],[6,2,6,4,null]]'::jsonb),
      (35, 'Hillside Park A', true, v_admin, p[2], p[1], p[4],
       '[[6,3,6,2,null],[6,4,4,6,"L"],[7,5,6,4,null],[6,1,6,3,null]]'::jsonb),
      (28, 'Meadowbank TC', false, p[1], p[3], v_admin, p[5],
       '[[6,2,6,2,null],[6,3,6,4,null],[6,4,3,6,"W"],[6,4,6,4,null]]'::jsonb),
      (21, 'St Mary''s LTC', true, v_admin, p[1], p[4], p[6],
       '[[4,6,3,6,null],[6,4,6,3,null],[6,7,6,4,"L"],[2,6,4,6,null]]'::jsonb),
      (14, 'Riverside LTC A', false, v_admin, p[3], p[2], p[7],
       '[[6,4,7,6,null],[2,6,3,6,null],[6,3,4,6,"W"],[4,6,6,7,null]]'::jsonb),
      (7, 'Castle Green LTC', true, p[1], p[2], p[3], p[5],
       '[[6,1,6,2,null],[6,3,6,3,null],[6,2,6,4,null],[7,5,6,3,null]]'::jsonb)
    ) as t(days_ago, opponent, is_home, a, b, c, d, rubbers)
  loop
      v_sel := array[r.a, r.b, r.c, r.d];

      insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name,
                                   fixture_date, start_time, location, is_home, team_selected_at, notes)
      values (v_club, v_sq1, v_season, v_div1, v_admin, r.opponent,
              current_date - r.days_ago, case when r.is_home then '10:00'::time else '14:00'::time end,
              case when r.is_home then v_club_name || ' courts' else r.opponent || ' courts' end,
              r.is_home, now() - make_interval(days => r.days_ago + 3), v_tag)
      returning id into v_fx;
      v_fixtures := v_fixtures || v_fx;

      -- Everyone in the squad replied; the four selected said yes.
      insert into public.availability (fixture_id, user_id, is_available, reason, submitted_at)
      select v_fx, u, u = any (v_sel),
             case when u = any (v_sel) then null else 'Away that weekend' end,
             now() - make_interval(days => r.days_ago + 5)
        from unnest(array[v_admin] || p[1:7]) as u;

      insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order) values
        (v_fx, r.a, 1, 1), (v_fx, r.b, 1, 2), (v_fx, r.c, 2, 1), (v_fx, r.d, 2, 2);

      perform public.save_fixture_result(v_fx, (
        select jsonb_agg(jsonb_build_object(
                 'rubber_number', k,
                 'player_1', case when k in (1, 3) then r.a else r.c end,
                 'player_2', case when k in (1, 3) then r.b else r.d end,
                 'set_1_won', (x ->> 0)::int, 'set_1_lost', (x ->> 1)::int,
                 'set_2_won', (x ->> 2)::int, 'set_2_lost', (x ->> 3)::int,
                 'champ_tie', x ->> 4))
          from jsonb_array_elements(r.rubbers) with ordinality as t(x, k)));
  end loop;

  -- Partner feedback: everyone rates their partner once per fixture (on the
  -- earliest rubber they played together), except you on the last two fixtures
  -- you played (so the Feedback tab has something to do).
  insert into public.partner_feedback (match_id, reviewer_id, reviewed_id, overall_rating,
                                       key_moments_rating, communication_rating, comments, created_at)
  select distinct on (m.fixture_id, mp.user_id, mp.partner_user_id)
         mp.match_id, mp.user_id, mp.partner_user_id,
         5 + (abs(hashtext(mp.match_id::text || mp.user_id::text)) % 5),
         4 + (abs(hashtext(mp.user_id::text || mp.match_id::text)) % 6),
         5 + (abs(hashtext(mp.partner_user_id::text || mp.match_id::text)) % 5),
         (array['Great serving today', 'Strong at the net', 'Kept us calm in the tie-break', null, null])
           [1 + abs(hashtext(mp.match_id::text)) % 5],
         m.match_date + 1
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
   where m.fixture_id = any (v_fixtures)
     and not (mp.user_id = v_admin and m.fixture_id = any (v_fixtures[4:5]))
   order by m.fixture_id, mp.user_id, mp.partner_user_id, m.rubber_number;

  -- ---------------------------------------------------------------
  -- Upcoming fixtures
  -- ---------------------------------------------------------------
  -- In 3 days: team picked, you're in pair 1.
  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, opponent_league_position, team_selected_at, notes)
  values (v_club, v_sq1, v_season, v_div1, v_admin, 'Northfield B', current_date + 3, '14:00',
          'Northfield Tennis Centre, Court Lane', false, 8, now(), v_tag || '. Meet at 13:15.')
  returning id into v_fx;
  insert into public.availability (fixture_id, user_id, is_available, reason) values
    (v_fx, v_admin, true, null), (v_fx, p[1], true, null), (v_fx, p[2], true, null), (v_fx, p[3], true, null),
    (v_fx, p[4], true, null), (v_fx, p[5], true, null), (v_fx, p[6], false, 'Injured ankle');
  insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order) values
    (v_fx, v_admin, 1, 1), (v_fx, p[4], 1, 2), (v_fx, p[1], 2, 1), (v_fx, p[2], 2, 2);

  -- In 10 days: waiting for your reply.
  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, opponent_league_position, notes)
  values (v_club, v_sq1, v_season, v_div1, v_admin, 'Oakwood TC', current_date + 10, '10:00',
          v_club_name || ' courts', true, 2, v_tag)
  returning id into v_fx;
  insert into public.availability (fixture_id, user_id, is_available, reason) values
    (v_fx, p[1], true, null), (v_fx, p[2], true, null), (v_fx, p[3], true, null), (v_fx, p[4], false, 'Family wedding');

  -- Further out: few or no replies yet.
  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, opponent_league_position, notes)
  values (v_club, v_sq1, v_season, v_div1, v_admin, 'Hillside Park A', current_date + 17, '14:00',
          'Hillside Park, Park Road', false, 4, v_tag)
  returning id into v_fx;
  insert into public.availability (fixture_id, user_id, is_available) values (v_fx, p[5], true);

  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, opponent_league_position, notes)
  values (v_club, v_sq1, v_season, v_div1, v_admin, 'Meadowbank TC', current_date + 31, '10:00',
          v_club_name || ' courts', true, 6, v_tag);

  -- ---------------------------------------------------------------
  -- 2nd Team: one result and one upcoming fixture
  -- ---------------------------------------------------------------
  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, team_selected_at, notes)
  values (v_club, v_sq2, v_season, v_div2, v_admin, 'Oakwood TC B', current_date - 10, '14:00',
          v_club_name || ' courts', true, now() - interval '13 days', v_tag)
  returning id into v_fx;
  insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order) values
    (v_fx, p[8], 1, 1), (v_fx, p[9], 1, 2), (v_fx, p[10], 2, 1), (v_fx, p[11], 2, 2);
  perform public.save_fixture_result(v_fx, jsonb_build_array(
    jsonb_build_object('rubber_number', 1, 'player_1', p[8], 'player_2', p[9], 'set_1_won', 6, 'set_1_lost', 3, 'set_2_won', 6, 'set_2_lost', 4),
    jsonb_build_object('rubber_number', 2, 'player_1', p[10], 'player_2', p[11], 'set_1_won', 4, 'set_1_lost', 6, 'set_2_won', 3, 'set_2_lost', 6),
    jsonb_build_object('rubber_number', 3, 'player_1', p[8], 'player_2', p[9], 'set_1_won', 6, 'set_1_lost', 4, 'set_2_won', 4, 'set_2_lost', 6, 'champ_tie', 'W'),
    jsonb_build_object('rubber_number', 4, 'player_1', p[10], 'player_2', p[11], 'set_1_won', 6, 'set_1_lost', 2, 'set_2_won', 6, 'set_2_lost', 3)));

  insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name, fixture_date,
                               start_time, location, is_home, notes)
  values (v_club, v_sq2, v_season, v_div2, v_admin, 'Hillside Park B', current_date + 5, '10:00',
          'Hillside Park, Park Road', false, v_tag)
  returning id into v_fx;
  insert into public.availability (fixture_id, user_id, is_available, reason) values
    (v_fx, p[8], true, null), (v_fx, p[9], true, null), (v_fx, p[12], false, 'Working');

  -- ---------------------------------------------------------------
  -- Injuries: one current, one recovered
  -- ---------------------------------------------------------------
  insert into public.injuries (user_id, description, start_date, expected_end_date, is_current, can_play, notes)
  values (p[6], 'Sprained ankle', current_date - 5, current_date + 12, true, false, 'Physio says two more weeks');
  insert into public.injuries (user_id, description, start_date, expected_end_date, is_current, can_play, ended_on)
  values (p[7], 'Tennis elbow', current_date - 40, current_date - 20, false, false, current_date - 22);

  raise notice 'Loaded test data into "%": 13 players, % fixtures.', v_club_name,
    (select count(*) from public.fixtures where club_id = v_club and notes like v_tag || '%');
end;
$$;

commit;
