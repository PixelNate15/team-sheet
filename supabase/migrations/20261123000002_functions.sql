-- =====================================================================
-- Sport Team Management: business logic (RPC functions)
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Push notifications via the Expo push service (no server key needed).
-- Failures are logged and never block the calling transaction.
-- ---------------------------------------------------------------------
create or replace function public.send_push(p_users uuid[], p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', p.expo_push_token, 'title', p_title, 'body', p_body,
           'data', p_data, 'sound', 'default'))
    into v_messages
    from public.profiles p
   where p.id = any (p_users)
     and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and p.notifications_enabled
     and p.expo_push_token is not null;

  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'send_push failed: %', sqlerrm;
end;
$$;
revoke execute on function public.send_push(uuid[], text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Form score: a faithful port of System/form_score_calculation.py
--   match_score = games_ratio * opponent_factor * partner_factor
--   form        = sum(match_score * recency) / sum(recency)
--   recency     = 0.5 ^ (days_since_match / 60)          (HALF_LIFE_DAYS)
--   opponent    = 0.8 + (team_count - opponent_position) / 10, only once the
--                 squad has played >= 2 resulted fixtures that season, else 1.0
--   partner     = partner's form when the match was played, else 1.0
--   window      = matches from the last 3 years (measured from today, as in
--                 the original) and strictly before p_at.
-- Returns NULL when the player has no matches in the window.
-- One query instead of the original's one-query-per-match.
-- ---------------------------------------------------------------------
create or replace function public.form_score(p_user uuid, p_at date default current_date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  with history as (
    select
      m.match_date,
      case when m.games_won + m.games_lost = 0 then 0::numeric
           else m.games_won::numeric / (m.games_won + m.games_lost) end           as games_ratio,
      case
        when d.team_count is not null
         and f.opponent_league_position is not null
         and (
           select count(*) from public.fixtures f2
            where f2.season_id = f.season_id
              and f2.squad_id = f.squad_id
              and f2.fixture_date < m.match_date
              and exists (select 1 from public.matches m2 where m2.fixture_id = f2.id)
         ) >= 2
        then 0.8 + (d.team_count - f.opponent_league_position)::numeric / 10
        else 1.0
      end                                                                         as opponent_factor,
      coalesce(mp.partner_form_at_match, 1.0)                                     as partner_factor,
      power(0.5::numeric, (p_at - m.match_date)::numeric / 60)                   as recency
    from public.match_players mp
    join public.matches m   on m.id = mp.match_id
    join public.fixtures f  on f.id = m.fixture_id
    left join public.divisions d on d.id = f.division_id
    where mp.user_id = p_user
      and m.match_date >= (current_date - interval '3 years')::date
      and m.match_date < p_at
      and (p_user = auth.uid() or public.same_club(p_user))
  )
  select case when sum(recency) is null or sum(recency) = 0 then null
              else round(sum(games_ratio * opponent_factor * partner_factor * recency) / sum(recency), 4)
         end
  from history
$$;

-- The "Form over 10 weeks" graph: one point per week ending today.
create or replace function public.form_history(p_user uuid, p_weeks int default 10)
returns table (week_date date, form numeric)
language sql stable security definer set search_path = ''
as $$
  select d::date, public.form_score(p_user, d::date)
  from generate_series(current_date - (7 * (p_weeks - 1)), current_date, interval '7 days') as d
  where public.same_club(p_user) or p_user = auth.uid()
  order by 1
$$;

-- ---------------------------------------------------------------------
-- Available players for a fixture: said yes, and not injured (unless they
-- can still play). Port of SQL/availability.get_all_available_players.
-- ---------------------------------------------------------------------
create or replace function public.available_players(p_fixture bigint)
returns table (user_id uuid, first_name text, surname text, form numeric)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.first_name, p.surname, public.form_score(p.id)
  from public.availability a
  join public.profiles p on p.id = a.user_id
  left join public.injuries i on i.user_id = a.user_id and i.is_current
  where a.fixture_id = p_fixture
    and a.is_available
    and (i.id is null or i.can_play)
    and public.fixture_club(p_fixture) = public.my_club_id()
  order by p.first_name, p.surname
$$;

-- ---------------------------------------------------------------------
-- Recommended team: port of System/generate_recommended_team.py
--   * sort available players by form (players without form last)
--   * player_1 = best remaining; candidates = remaining players whose form is
--     within 0.05 of the second-best player (FORM_THRESHOLD)
--   * partner = candidate with most partnership matches with player_1 in the
--     last 3 years (ties -> higher form); otherwise the second-best player
--   * repeat for 2 pairs (PAIRS_PER_TEAM)
-- Returns no rows when fewer than 4 players are available or nobody has form.
-- ---------------------------------------------------------------------
create or replace function public.recommended_team(p_fixture bigint)
returns table (pair_number int, selection_order int, user_id uuid, first_name text, surname text, form numeric)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids    uuid[];
  v_forms  numeric[];
  v_pair   int := 0;
  v_p1     uuid;
  v_p1form numeric;
  v_p2form numeric;
  v_best   uuid;
  v_bestc  int;
  v_count  int;
  i        int;
begin
  if not public.can_manage_squad(public.fixture_squad(p_fixture)) then
    raise exception 'Only the squad captain can see the recommended team';
  end if;

  select array_agg(a.user_id order by a.form desc nulls last),
         array_agg(a.form    order by a.form desc nulls last)
    into v_ids, v_forms
    from public.available_players(p_fixture) a;

  if v_ids is null or array_length(v_ids, 1) < 4 or v_forms[1] is null then
    return;
  end if;

  while v_pair < 2 and coalesce(array_length(v_ids, 1), 0) >= 2 loop
    v_pair   := v_pair + 1;
    v_p1     := v_ids[1];
    v_p1form := v_forms[1];
    v_p2form := v_forms[2];
    v_best   := null;
    v_bestc  := -1;

    if v_p2form is not null then
      for i in 2 .. array_length(v_ids, 1) loop
        if v_forms[i] is not null and abs(v_p2form - v_forms[i]) <= 0.05 then
          select count(*) into v_count
            from public.match_players mp
            join public.matches m on m.id = mp.match_id
           where mp.user_id = v_p1
             and mp.partner_user_id = v_ids[i]
             and m.match_date >= (current_date - interval '3 years')::date;
          if v_count > v_bestc then
            v_bestc := v_count;
            v_best  := v_ids[i];
          end if;
        end if;
      end loop;
    end if;

    if v_best is null then
      v_best := v_ids[2];
    end if;

    return query
      select v_pair, 1, p.id, p.first_name, p.surname, v_p1form
        from public.profiles p where p.id = v_p1;
    return query
      select v_pair, 2, p.id, p.first_name, p.surname, v_forms[array_position(v_ids, v_best)]
        from public.profiles p where p.id = v_best;

    select array_agg(t.u order by t.o), array_agg(t.f order by t.o)
      into v_ids, v_forms
      from unnest(v_ids, v_forms) with ordinality as t(u, f, o)
     where t.u <> v_p1 and t.u <> v_best;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Clubs: create / join / regenerate code / leave / delete account
-- ---------------------------------------------------------------------
create or replace function public.generate_join_code()
returns text
language sql volatile set search_path = ''
as $$
  -- 6 characters, no easily-confused letters/digits (0/O, 1/I/L).
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6)
$$;

create or replace function public.create_club(
  p_club_name     text,
  p_season_name   text,
  p_squad_name    text,
  p_division_name text,
  p_team_count    int
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club     bigint;
  v_division bigint;
  v_squad    bigint;
  v_code     text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.club_members where user_id = auth.uid()) then
    raise exception 'You are already a member of a club';
  end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.clubs where join_code = v_code);
  end loop;

  insert into public.clubs (name, join_code, created_by)
  values (btrim(p_club_name), v_code, auth.uid())
  returning id into v_club;

  insert into public.club_members (club_id, user_id, role) values (v_club, auth.uid(), 'admin');
  insert into public.seasons (club_id, name, is_current) values (v_club, btrim(p_season_name), true);

  insert into public.divisions (club_id, name, team_count)
  values (v_club, btrim(p_division_name), p_team_count)
  returning id into v_division;

  insert into public.squads (club_id, name, ranking, division_id, captain_id)
  values (v_club, btrim(p_squad_name), 1, v_division, auth.uid())
  returning id into v_squad;

  insert into public.squad_players (user_id, squad_id) values (auth.uid(), v_squad);

  return v_club;
end;
$$;

create or replace function public.join_club(p_code text)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club bigint;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.club_members where user_id = auth.uid()) then
    raise exception 'You are already a member of a club';
  end if;

  select id into v_club from public.clubs where join_code = upper(btrim(p_code));
  if v_club is null then
    raise exception 'That club code was not recognised';
  end if;

  insert into public.club_members (club_id, user_id, role) values (v_club, auth.uid(), 'member');
  return v_club;
end;
$$;

create or replace function public.regenerate_join_code()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text;
  v_club bigint := public.my_club_id();
begin
  if not public.is_club_admin(v_club) then
    raise exception 'Only club admins can change the join code';
  end if;
  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.clubs where join_code = v_code);
  end loop;
  update public.clubs set join_code = v_code where id = v_club;
  return v_code;
end;
$$;

-- Leaving a club also removes squad membership.
create or replace function public.leave_club()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club bigint := public.my_club_id();
begin
  if v_club is null then
    return;
  end if;
  if public.is_club_admin(v_club)
     and not exists (select 1 from public.club_members
                      where club_id = v_club and role = 'admin' and user_id <> auth.uid()) then
    raise exception 'Make another member an admin before leaving the club';
  end if;
  delete from public.squad_players where user_id = auth.uid();
  update public.squads set captain_id = null where captain_id = auth.uid();
  delete from public.club_members where user_id = auth.uid();
end;
$$;

-- In-app account deletion (required by Apple and Google). Cascades to all personal data.
create or replace function public.delete_my_account()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Squad management (captains). Ports of SQL/squad.py.
-- ---------------------------------------------------------------------

-- Add players from lower-ranked squads (or with no squad) to a squad.
create or replace function public.add_players_to_squad(p_squad bigint, p_users uuid[])
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club    bigint;
  v_ranking int;
  v_count   int;
begin
  if not public.can_manage_squad(p_squad) then
    raise exception 'Only the squad captain can add players';
  end if;
  select club_id, ranking into v_club, v_ranking from public.squads where id = p_squad;

  insert into public.squad_players (user_id, squad_id)
  select cm.user_id, p_squad
    from public.club_members cm
    left join public.squad_players sp on sp.user_id = cm.user_id
    left join public.squads s on s.id = sp.squad_id
   where cm.club_id = v_club
     and cm.user_id = any (p_users)
     and (s.id is null or s.ranking > v_ranking or public.is_club_admin(v_club))
  on conflict (user_id) do update set squad_id = excluded.squad_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Move a player to the next squad down (port of remove_player_from_squad).
-- If there is no lower squad the player is removed from squads altogether.
create or replace function public.move_player_down(p_user uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_squad   bigint;
  v_club    bigint;
  v_ranking int;
  v_lower   bigint;
  v_name    text;
begin
  select sp.squad_id, s.club_id, s.ranking into v_squad, v_club, v_ranking
    from public.squad_players sp join public.squads s on s.id = sp.squad_id
   where sp.user_id = p_user;

  if v_squad is null then
    raise exception 'That player is not in a squad';
  end if;
  if not public.can_manage_squad(v_squad) then
    raise exception 'Only the squad captain can move players';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot move yourself';
  end if;

  select id, name into v_lower, v_name from public.squads
   where club_id = v_club and ranking > v_ranking
   order by ranking limit 1;

  if v_lower is null then
    delete from public.squad_players where user_id = p_user;
    return null;
  end if;

  update public.squad_players set squad_id = v_lower where user_id = p_user;
  return v_name;
end;
$$;

-- Admin: put any club member into any squad (or none).
create or replace function public.admin_set_player_squad(p_user uuid, p_squad bigint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club bigint := public.my_club_id();
begin
  if not public.is_club_admin(v_club) then
    raise exception 'Only club admins can do this';
  end if;
  if not exists (select 1 from public.club_members where user_id = p_user and club_id = v_club) then
    raise exception 'That player is not in your club';
  end if;
  if p_squad is null then
    delete from public.squad_players where user_id = p_user;
  else
    if not exists (select 1 from public.squads where id = p_squad and club_id = v_club) then
      raise exception 'Unknown squad';
    end if;
    insert into public.squad_players (user_id, squad_id) values (p_user, p_squad)
    on conflict (user_id) do update set squad_id = excluded.squad_id;
  end if;
end;
$$;

-- Admin: make a season the current one.
create or replace function public.set_current_season(p_season bigint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club bigint := public.my_club_id();
begin
  if not public.is_club_admin(v_club) then
    raise exception 'Only club admins can do this';
  end if;
  update public.seasons set is_current = false where club_id = v_club and is_current;
  update public.seasons set is_current = true where id = p_season and club_id = v_club;
end;
$$;

-- ---------------------------------------------------------------------
-- Player statistics (port of get_players_in_one_squad /
-- get_all_players_for_squads_below_ranking), for every player in the club.
-- ---------------------------------------------------------------------
create or replace function public.club_players()
returns table (
  user_id                     uuid,
  first_name                  text,
  surname                     text,
  role                        text,
  squad_id                    bigint,
  squad_name                  text,
  squad_ranking               int,
  division_name               text,
  is_captain                  boolean,
  games_played                int,
  wins                        int,
  win_percentage              numeric,
  last_match_date             date,
  injury_description          text,
  injury_can_play             boolean,
  fixtures_played_this_season int,
  form                        numeric
)
language sql stable security definer set search_path = ''
as $$
  select
    p.id, p.first_name, p.surname, cm.role,
    s.id, s.name, s.ranking, d.name,
    exists (select 1 from public.squads cs where cs.captain_id = p.id),
    coalesce(st.games_played, 0)::int,
    coalesce(st.wins, 0)::int,
    case when coalesce(st.games_played, 0) = 0 then 0
         else round(st.wins::numeric * 100 / st.games_played, 1) end,
    st.last_match_date,
    i.description,
    i.can_play,
    coalesce(st.fixtures_this_season, 0)::int,
    public.form_score(p.id)
  from public.club_members cm
  join public.profiles p on p.id = cm.user_id
  left join public.squad_players sp on sp.user_id = p.id
  left join public.squads s on s.id = sp.squad_id
  left join public.divisions d on d.id = s.division_id
  left join public.injuries i on i.user_id = p.id and i.is_current
  left join lateral (
    select count(*) as games_played,
           count(*) filter (where m.did_win) as wins,
           max(m.match_date) as last_match_date,
           count(distinct m.fixture_id) filter (where se.is_current) as fixtures_this_season
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
      join public.fixtures f on f.id = m.fixture_id
      left join public.seasons se on se.id = f.season_id
     where mp.user_id = p.id
  ) st on true
  where cm.club_id = public.my_club_id()
  order by s.ranking nulls last, p.first_name, p.surname
$$;

-- ---------------------------------------------------------------------
-- Member views
-- ---------------------------------------------------------------------

-- Upcoming fixtures for the signed-in player's squad, with their own
-- availability and selection (port of SQL/fixtures.get_fixtures).
create or replace function public.my_fixtures()
returns table (
  id               bigint,
  opponent_name    text,
  fixture_date     date,
  start_time       time,
  location         text,
  is_home          boolean,
  notes            text,
  division_name    text,
  squad_name       text,
  is_available     boolean,
  reason           text,
  is_selected      boolean,
  pair_number      int,
  partner_name     text,
  team_selected    boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    f.id, f.opponent_name, f.fixture_date, f.start_time, f.location, f.is_home, f.notes,
    d.name, s.name,
    a.is_available, a.reason,
    tsp.user_id is not null, tsp.pair_number,
    (select pp.first_name || ' ' || pp.surname
       from public.team_selection_players t2
       join public.profiles pp on pp.id = t2.user_id
      where t2.fixture_id = f.id and t2.pair_number = tsp.pair_number and t2.user_id <> auth.uid()),
    f.team_selected_at is not null
  from public.squad_players sp
  join public.fixtures f on f.squad_id = sp.squad_id
  join public.squads s on s.id = f.squad_id
  left join public.divisions d on d.id = f.division_id
  left join public.availability a on a.fixture_id = f.id and a.user_id = sp.user_id
  left join public.team_selection_players tsp on tsp.fixture_id = f.id and tsp.user_id = sp.user_id
  where sp.user_id = auth.uid()
    and f.fixture_date >= current_date
  order by f.fixture_date, f.start_time
$$;

-- Rubbers the signed-in player played in the last 6 months
-- (port of get_result_of_fixture_for_one_user), plus team totals and
-- whether partner feedback has been given.
create or replace function public.my_results()
returns table (
  match_id          bigint,
  fixture_id        bigint,
  opponent_name     text,
  fixture_date      date,
  is_home           boolean,
  rubber_number     int,
  pair_number       int,
  opponent_pair     int,
  did_win           boolean,
  sets_won          int,
  sets_lost         int,
  games_won         int,
  games_lost        int,
  set_1_won         int,
  set_1_lost        int,
  set_2_won         int,
  set_2_lost        int,
  champ_tie         text,
  partner_id        uuid,
  partner_name      text,
  feedback_given    boolean,
  team_sets_won     int,
  team_sets_lost    int
)
language sql stable security definer set search_path = ''
as $$
  select
    m.id, f.id, f.opponent_name, f.fixture_date, f.is_home,
    m.rubber_number, m.pair_number, m.opponent_pair_number,
    m.did_win, m.sets_won, m.sets_lost, m.games_won, m.games_lost,
    m.set_1_won, m.set_1_lost, m.set_2_won, m.set_2_lost, m.champ_tie::text,
    mp.partner_user_id, pp.first_name || ' ' || pp.surname,
    exists (select 1 from public.partner_feedback pf where pf.match_id = m.id and pf.reviewer_id = auth.uid()),
    (select sum(x.sets_won)::int from public.matches x where x.fixture_id = f.id),
    (select sum(x.sets_lost)::int from public.matches x where x.fixture_id = f.id)
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  join public.fixtures f on f.id = m.fixture_id
  join public.profiles pp on pp.id = mp.partner_user_id
  where mp.user_id = auth.uid()
    and m.match_date >= (current_date - interval '6 months')::date
  order by f.fixture_date desc, m.rubber_number
$$;

-- ---------------------------------------------------------------------
-- Captain views
-- ---------------------------------------------------------------------

-- Upcoming fixtures for a squad with an availability summary.
create or replace function public.squad_fixtures(p_squad bigint)
returns table (
  id              bigint,
  opponent_name   text,
  fixture_date    date,
  start_time      time,
  location        text,
  is_home         boolean,
  available_count int,
  unavailable_count int,
  no_reply_count  int,
  team_selected   boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    f.id, f.opponent_name, f.fixture_date, f.start_time, f.location, f.is_home,
    (select count(*) from public.availability a where a.fixture_id = f.id and a.is_available)::int,
    (select count(*) from public.availability a where a.fixture_id = f.id and not a.is_available)::int,
    (select count(*) from public.squad_players sp
      where sp.squad_id = f.squad_id
        and not exists (select 1 from public.availability a where a.fixture_id = f.id and a.user_id = sp.user_id))::int,
    f.team_selected_at is not null
  from public.fixtures f
  where f.squad_id = p_squad
    and f.club_id = public.my_club_id()
    and f.fixture_date >= current_date
  order by f.fixture_date, f.start_time
$$;

-- Played fixtures that still need a result (port of get_fixtures_without_results).
create or replace function public.fixtures_needing_results(p_squad bigint)
returns table (id bigint, opponent_name text, fixture_date date, start_time time, location text, is_home boolean)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.opponent_name, f.fixture_date, f.start_time, f.location, f.is_home
  from public.fixtures f
  where f.squad_id = p_squad
    and f.club_id = public.my_club_id()
    and f.fixture_date <= current_date
    and not exists (select 1 from public.matches m where m.fixture_id = f.id)
  order by f.fixture_date, f.start_time
$$;

-- Current-season results for a squad (port of get_squad_results).
create or replace function public.squad_results(p_squad bigint)
returns table (
  id            bigint,
  opponent_name text,
  fixture_date  date,
  is_home       boolean,
  sets_won      int,
  sets_lost     int,
  rubbers_won   int,
  rubbers_lost  int
)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.opponent_name, f.fixture_date, f.is_home,
         sum(m.sets_won)::int, sum(m.sets_lost)::int,
         count(*) filter (where m.did_win)::int,
         count(*) filter (where not m.did_win)::int
  from public.fixtures f
  join public.matches m on m.fixture_id = f.id
  left join public.seasons s on s.id = f.season_id
  where f.squad_id = p_squad
    and f.club_id = public.my_club_id()
    and coalesce(s.is_current, true)
  group by f.id
  order by f.fixture_date desc
$$;

-- Who has / hasn't replied for a fixture (captain's availability grid).
create or replace function public.fixture_availability(p_fixture bigint)
returns table (
  user_id          uuid,
  first_name       text,
  surname          text,
  is_available     boolean,
  reason           text,
  injury           text,
  injury_can_play  boolean
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.first_name, p.surname, a.is_available, a.reason, i.description, i.can_play
  from public.fixtures f
  join public.squad_players sp on sp.squad_id = f.squad_id
  join public.profiles p on p.id = sp.user_id
  left join public.availability a on a.fixture_id = f.id and a.user_id = p.id
  left join public.injuries i on i.user_id = p.id and i.is_current
  where f.id = p_fixture
    and f.club_id = public.my_club_id()
  order by a.is_available desc nulls last, p.first_name
$$;

-- ---------------------------------------------------------------------
-- Writes: fixtures (with team) and results, each in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.save_fixture(
  p_fixture_id      bigint,
  p_squad_id        bigint,
  p_opponent_name   text,
  p_fixture_date    date,
  p_start_time      time,
  p_location        text,
  p_is_home         boolean,
  p_league_position int,
  p_notes           text,
  p_players         jsonb   -- [{user_id, pair_number, selection_order}] or null to leave unchanged
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id         bigint := p_fixture_id;
  v_club       bigint;
  v_division   bigint;
  v_season     bigint;
  v_old_team   uuid[];
  v_new_team   uuid[];
  v_squad_users uuid[];
  v_is_new     boolean := p_fixture_id is null;
  v_label      text;
begin
  if v_is_new then
    if not public.can_manage_squad(p_squad_id) then
      raise exception 'Only the squad captain can add fixtures';
    end if;
    if p_fixture_date < current_date then
      raise exception 'The fixture date cannot be in the past';
    end if;
    select club_id, division_id into v_club, v_division from public.squads where id = p_squad_id;
    select id into v_season from public.seasons where club_id = v_club and is_current;
    if v_season is null then
      raise exception 'There is no current season. Ask a club admin to start one.';
    end if;

    insert into public.fixtures (club_id, squad_id, season_id, division_id, created_by, opponent_name,
                                 fixture_date, start_time, location, is_home, opponent_league_position, notes)
    values (v_club, p_squad_id, v_season, v_division, auth.uid(), btrim(p_opponent_name),
            p_fixture_date, p_start_time, btrim(p_location), p_is_home, p_league_position, nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    if not public.can_manage_squad(public.fixture_squad(v_id)) then
      raise exception 'Only the squad captain can edit this fixture';
    end if;
    update public.fixtures
       set opponent_name = btrim(p_opponent_name),
           fixture_date = p_fixture_date,
           start_time = p_start_time,
           location = btrim(p_location),
           is_home = p_is_home,
           opponent_league_position = p_league_position,
           notes = nullif(btrim(p_notes), '')
     where id = v_id
    returning club_id into v_club;
  end if;

  if p_players is not null then
    select array_agg(user_id order by pair_number, selection_order) into v_old_team
      from public.team_selection_players where fixture_id = v_id;

    delete from public.team_selection_players where fixture_id = v_id;

    insert into public.team_selection_players (fixture_id, user_id, pair_number, selection_order)
    select v_id, x.user_id, x.pair_number, x.selection_order
      from jsonb_to_recordset(p_players) as x(user_id uuid, pair_number int, selection_order int)
     where x.user_id is not null;

    if exists (
      select 1 from public.team_selection_players t
       where t.fixture_id = v_id
         and not exists (select 1 from public.club_members cm where cm.user_id = t.user_id and cm.club_id = v_club)
    ) then
      raise exception 'Selected players must be members of your club';
    end if;

    select array_agg(user_id order by pair_number, selection_order) into v_new_team
      from public.team_selection_players where fixture_id = v_id;

    update public.fixtures
       set team_selected_at = case when v_new_team is null then null else now() end
     where id = v_id;
  end if;

  -- Notifications
  v_label := (case when p_is_home then 'vs ' else '@ ' end) || btrim(p_opponent_name)
             || ' on ' || to_char(p_fixture_date, 'Dy DD Mon');

  if v_is_new then
    select array_agg(user_id) into v_squad_users from public.squad_players where squad_id = p_squad_id;
    perform public.send_push(v_squad_users, 'New fixture: ' || v_label,
                             'Let your captain know if you can play.',
                             jsonb_build_object('type', 'fixture', 'fixture_id', v_id));
  else
    select array_agg(user_id) into v_squad_users
      from public.squad_players where squad_id = public.fixture_squad(v_id);
    perform public.send_push(v_squad_users, 'Fixture updated: ' || v_label,
                             'Check the latest details.',
                             jsonb_build_object('type', 'fixture', 'fixture_id', v_id));
  end if;

  if v_new_team is not null and v_new_team is distinct from v_old_team then
    perform public.send_push(v_new_team, 'You''ve been selected! ' || v_label,
                             'Tap to see your partner and match details.',
                             jsonb_build_object('type', 'fixture', 'fixture_id', v_id));
  end if;

  return v_id;
end;
$$;

-- Captain deletes a fixture (everything attached cascades).
create or replace function public.remove_fixture(p_fixture bigint)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_users uuid[];
  v_label text;
begin
  if not public.can_manage_squad(public.fixture_squad(p_fixture)) then
    raise exception 'Only the squad captain can remove this fixture';
  end if;
  select array_agg(sp.user_id), max(f.opponent_name || ' on ' || to_char(f.fixture_date, 'Dy DD Mon'))
    into v_users, v_label
    from public.fixtures f join public.squad_players sp on sp.squad_id = f.squad_id
   where f.id = p_fixture and f.fixture_date >= current_date;
  delete from public.fixtures where id = p_fixture;
  if v_users is not null then
    perform public.send_push(v_users, 'Fixture cancelled', 'The fixture against ' || v_label || ' has been cancelled.',
                             jsonb_build_object('type', 'cancelled'));
  end if;
end;
$$;

-- A tennis set is valid at 6-0..6-4, 7-5 or 7-6 (either way round).
create or replace function public.is_valid_set(p_won int, p_lost int)
returns boolean
language sql immutable set search_path = ''
as $$
  select (greatest(p_won, p_lost) = 6 and least(p_won, p_lost) <= 4)
      or (greatest(p_won, p_lost) = 7 and least(p_won, p_lost) in (5, 6))
$$;

-- Save all four rubbers of a fixture in one transaction (replaces the
-- per-match save_match loop). p_matches: [{rubber_number, player_1, player_2,
-- set_1_won, set_1_lost, set_2_won, set_2_lost, champ_tie}] (4 items).
-- Pairs follow the original: rubbers 1-4 = our pairs [1,2,1,2] vs their [1,2,2,1].
create or replace function public.save_fixture_result(p_fixture bigint, p_matches jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture   public.fixtures%rowtype;
  v_row       record;
  v_match_id  bigint;
  v_sets_won  int;
  v_sets_lost int;
  v_form_1    numeric;
  v_form_2    numeric;
  v_pairs     int[] := array[1, 2, 1, 2];
  v_opp_pairs int[] := array[1, 2, 2, 1];
  v_players   uuid[];
  v_won       int;
  v_lost      int;
  v_is_new    boolean;
begin
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v_fixture.id is null or not public.can_manage_squad(v_fixture.squad_id) then
    raise exception 'Only the squad captain can enter this result';
  end if;
  if v_fixture.fixture_date > current_date then
    raise exception 'Results can only be entered once the fixture has been played';
  end if;
  if jsonb_array_length(p_matches) <> 4 then
    raise exception 'A result needs all 4 rubbers';
  end if;

  v_is_new := not exists (select 1 from public.matches where fixture_id = p_fixture);

  for v_row in
    select * from jsonb_to_recordset(p_matches) as x(
      rubber_number int, player_1 uuid, player_2 uuid,
      set_1_won int, set_1_lost int, set_2_won int, set_2_lost int, champ_tie text)
    order by rubber_number
  loop
    if v_row.rubber_number not between 1 and 4 then
      raise exception 'Invalid rubber number';
    end if;
    if v_row.player_1 is null or v_row.player_2 is null or v_row.player_1 = v_row.player_2 then
      raise exception 'Rubber %: choose two different players', v_row.rubber_number;
    end if;
    if not public.is_valid_set(v_row.set_1_won, v_row.set_1_lost)
       or not public.is_valid_set(v_row.set_2_won, v_row.set_2_lost) then
      raise exception 'Rubber %: each set must finish 6-0 to 6-4, 7-5 or 7-6', v_row.rubber_number;
    end if;

    v_sets_won  := (v_row.set_1_won > v_row.set_1_lost)::int + (v_row.set_2_won > v_row.set_2_lost)::int;
    v_sets_lost := 2 - v_sets_won;

    if v_sets_won = 1 then
      if v_row.champ_tie not in ('W', 'L') or v_row.champ_tie is null then
        raise exception 'Rubber %: sets are 1-1, so enter the champions tie-break result', v_row.rubber_number;
      end if;
      if v_row.champ_tie = 'W' then v_sets_won := 2; else v_sets_lost := 2; end if;
    elsif v_row.champ_tie is not null and v_row.champ_tie <> '' then
      raise exception 'Rubber %: a champions tie-break is only played at one set all', v_row.rubber_number;
    end if;

    -- Each player's partner form at the time of the match (as in the original).
    v_form_1 := public.form_score(v_row.player_1, v_fixture.fixture_date);
    v_form_2 := public.form_score(v_row.player_2, v_fixture.fixture_date);

    insert into public.matches (
      fixture_id, rubber_number, pair_number, opponent_pair_number, match_date,
      did_win, sets_won, sets_lost, games_won, games_lost,
      set_1_won, set_1_lost, set_2_won, set_2_lost, champ_tie)
    values (
      p_fixture, v_row.rubber_number, v_pairs[v_row.rubber_number], v_opp_pairs[v_row.rubber_number],
      v_fixture.fixture_date, v_sets_won > v_sets_lost, v_sets_won, v_sets_lost,
      v_row.set_1_won + v_row.set_2_won, v_row.set_1_lost + v_row.set_2_lost,
      v_row.set_1_won, v_row.set_1_lost, v_row.set_2_won, v_row.set_2_lost,
      nullif(v_row.champ_tie, ''))
    on conflict (fixture_id, rubber_number) do update set
      did_win = excluded.did_win, sets_won = excluded.sets_won, sets_lost = excluded.sets_lost,
      games_won = excluded.games_won, games_lost = excluded.games_lost,
      set_1_won = excluded.set_1_won, set_1_lost = excluded.set_1_lost,
      set_2_won = excluded.set_2_won, set_2_lost = excluded.set_2_lost,
      champ_tie = excluded.champ_tie, match_date = excluded.match_date
    returning id into v_match_id;

    -- Replace the players (keeps feedback attached to the match).
    delete from public.match_players where match_id = v_match_id;
    insert into public.match_players (match_id, user_id, partner_user_id, partner_form_at_match)
    values (v_match_id, v_row.player_1, v_row.player_2, v_form_2),
           (v_match_id, v_row.player_2, v_row.player_1, v_form_1);

    v_players := v_players || array[v_row.player_1, v_row.player_2];
  end loop;

  if v_is_new then
    select sum(sets_won), sum(sets_lost) into v_won, v_lost from public.matches where fixture_id = p_fixture;
    perform public.send_push(
      array(select distinct unnest(v_players)),
      'Result: ' || v_won || '-' || v_lost || ' vs ' || v_fixture.opponent_name,
      'Don''t forget to rate your partner.',
      jsonb_build_object('type', 'result', 'fixture_id', p_fixture));
  end if;
end;
$$;

-- Notify a fixture's non-responders (captain's "chase" button).
create or replace function public.chase_availability(p_fixture bigint)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_users uuid[];
  v_label text;
begin
  if not public.can_manage_squad(public.fixture_squad(p_fixture)) then
    raise exception 'Only the squad captain can do this';
  end if;
  select array_agg(sp.user_id) into v_users
    from public.fixtures f
    join public.squad_players sp on sp.squad_id = f.squad_id
   where f.id = p_fixture
     and not exists (select 1 from public.availability a where a.fixture_id = f.id and a.user_id = sp.user_id);
  select opponent_name || ' on ' || to_char(fixture_date, 'Dy DD Mon') into v_label
    from public.fixtures where id = p_fixture;
  perform public.send_push(v_users, 'Are you available?', 'Your captain needs to know for ' || v_label || '.',
                           jsonb_build_object('type', 'fixture', 'fixture_id', p_fixture));
  return coalesce(array_length(v_users, 1), 0);
end;
$$;

-- Internal helpers are not callable by clients, and nothing is callable
-- without signing in.
revoke execute on function public.generate_join_code() from public, anon, authenticated;
revoke execute on all functions in schema public from anon;
