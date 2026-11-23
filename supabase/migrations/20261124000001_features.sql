-- =====================================================================
-- Feature batch 1: automatic availability reminders, partnership stats,
-- head-to-head records and a captain-maintained league table.
--
-- Reminder: since 20261123000004, every new function in `public` is
-- executable by signed-in users unless revoked, so internal-only functions
-- below are revoked explicitly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Automatic availability reminders
-- ---------------------------------------------------------------------

-- Supabase's scheduler: runs SQL on a cron schedule (times are UTC).
create extension if not exists pg_cron with schema pg_catalog;

-- Push to every squad player who hasn't replied, 5 days and 2 days before
-- each fixture. Same query as the captain's "Remind" button
-- (chase_availability) but run by the scheduler, so there's no captain check.
-- Returns how many reminders were due (players without a push token are
-- counted but send_push skips them).
create or replace function public.send_availability_reminders(p_today date default current_date)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture record;
  v_users   uuid[];
  v_total   int := 0;
begin
  for v_fixture in
    select f.id, f.squad_id, f.opponent_name, f.is_home, f.fixture_date, f.fixture_date - p_today as days_left
      from public.fixtures f
     where f.fixture_date - p_today in (5, 2)
  loop
    select array_agg(sp.user_id) into v_users
      from public.squad_players sp
     where sp.squad_id = v_fixture.squad_id
       and not exists (
         select 1 from public.availability a
          where a.fixture_id = v_fixture.id and a.user_id = sp.user_id);

    if v_users is not null then
      perform public.send_push(
        v_users,
        'Can you play?',
        (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name
          || ' is in ' || v_fixture.days_left || ' days ('
          || to_char(v_fixture.fixture_date, 'Dy DD Mon') || '). Let your captain know.',
        jsonb_build_object('type', 'fixture', 'fixture_id', v_fixture.id));
      v_total := v_total + array_length(v_users, 1);
    end if;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.send_availability_reminders(date) from public, anon, authenticated;

-- Every day at 09:00 UTC (9am in winter, 10am in summer, UK time).
-- Scheduling under an existing name replaces that job, so this is safe to re-run.
select cron.schedule(
  'availability-reminders',
  '0 9 * * *',
  $$select public.send_availability_reminders()$$
);

-- ---------------------------------------------------------------------
-- 2. Partnership stats and head-to-head (read-only, own club only)
-- ---------------------------------------------------------------------

-- One row per partner a player has played with.
create or replace function public.partner_stats(p_user uuid)
returns table (
  partner_id     uuid,
  first_name     text,
  surname        text,
  rubbers        int,
  wins           int,
  win_percentage numeric,
  games_won      int,
  games_lost     int,
  last_played    date
)
language sql stable security definer set search_path = ''
as $$
  select
    mp.partner_user_id, p.first_name, p.surname,
    count(*)::int,
    count(*) filter (where m.did_win)::int,
    round(count(*) filter (where m.did_win)::numeric * 100 / count(*), 1),
    sum(m.games_won)::int,
    sum(m.games_lost)::int,
    max(m.match_date)
  from public.match_players mp
  join public.matches m  on m.id = mp.match_id
  join public.profiles p on p.id = mp.partner_user_id
  where mp.user_id = p_user
    and (p_user = auth.uid() or public.same_club(p_user))
  group by mp.partner_user_id, p.first_name, p.surname
  order by 6 desc, 4 desc, 9 desc
$$;

-- Every pair that has played together for a squad. Pairs with 2+ rubbers
-- come first, so a single lucky win doesn't top the list.
create or replace function public.squad_pairings(p_squad bigint)
returns table (
  player_1_id      uuid,
  player_1_name    text,
  player_2_id      uuid,
  player_2_name    text,
  rubbers          int,
  wins             int,
  win_percentage   numeric,
  games_won        int,
  games_lost       int,
  last_played      date
)
language sql stable security definer set search_path = ''
as $$
  select
    mp.user_id, p1.first_name || ' ' || p1.surname,
    mp.partner_user_id, p2.first_name || ' ' || p2.surname,
    count(*)::int,
    count(*) filter (where m.did_win)::int,
    round(count(*) filter (where m.did_win)::numeric * 100 / count(*), 1),
    sum(m.games_won)::int,
    sum(m.games_lost)::int,
    max(m.match_date)
  from public.match_players mp
  join public.matches m   on m.id = mp.match_id
  join public.fixtures f  on f.id = m.fixture_id
  join public.profiles p1 on p1.id = mp.user_id
  join public.profiles p2 on p2.id = mp.partner_user_id
  where f.squad_id = p_squad
    and f.club_id = public.my_club_id()
    and mp.user_id < mp.partner_user_id          -- each pair once
  group by mp.user_id, p1.first_name, p1.surname, mp.partner_user_id, p2.first_name, p2.surname
  order by count(*) >= 2 desc, 7 desc, 5 desc, 10 desc
$$;

-- A squad's record against each opponent club (names matched ignoring case
-- and spaces). A fixture is won when our sets total is higher.
create or replace function public.opponent_record(p_squad bigint)
returns table (
  opponent_name  text,
  played         int,
  won            int,
  drawn          int,
  lost           int,
  rubbers_won    int,
  rubbers_lost   int,
  last_played    date
)
language sql stable security definer set search_path = ''
as $$
  with fixture_totals as (
    select f.id, f.opponent_name, f.fixture_date,
           sum(m.sets_won) as sets_won, sum(m.sets_lost) as sets_lost,
           count(*) filter (where m.did_win) as rubbers_won,
           count(*) filter (where not m.did_win) as rubbers_lost
      from public.fixtures f
      join public.matches m on m.fixture_id = f.id
     where f.squad_id = p_squad
       and f.club_id = public.my_club_id()
     group by f.id
  )
  select
    (array_agg(btrim(opponent_name) order by fixture_date desc))[1],
    count(*)::int,
    count(*) filter (where sets_won > sets_lost)::int,
    count(*) filter (where sets_won = sets_lost)::int,
    count(*) filter (where sets_won < sets_lost)::int,
    sum(rubbers_won)::int,
    sum(rubbers_lost)::int,
    max(fixture_date)
  from fixture_totals
  group by lower(btrim(opponent_name))
  order by max(fixture_date) desc
$$;

-- ---------------------------------------------------------------------
-- 3. League table (entered by a captain or admin, per division per season)
-- ---------------------------------------------------------------------
create table public.league_table_rows (
  id           bigint generated always as identity primary key,
  division_id  bigint not null references public.divisions (id) on delete cascade,
  season_id    bigint not null references public.seasons (id) on delete cascade,
  position     int not null check (position between 1 and 40),
  team_name    text not null check (char_length(btrim(team_name)) between 1 and 100),
  played       int not null default 0 check (played between 0 and 200),
  points       int not null default 0 check (points between -1000 and 10000),
  is_own_team  boolean not null default false,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (division_id, season_id, position)
);
create unique index league_table_rows_team_unique
  on public.league_table_rows (division_id, season_id, lower(btrim(team_name)));

alter table public.league_table_rows enable row level security;

-- Anyone in the club can read their divisions' tables. There are no write
-- policies: changes only go through save_league_table.
create policy league_table_select on public.league_table_rows for select to authenticated
  using (exists (
    select 1 from public.divisions d
     where d.id = league_table_rows.division_id and d.club_id = public.my_club_id()));

-- New tables get no privileges automatically (see 20261123000003_grants.sql).
grant select on public.league_table_rows to authenticated;

-- Club admin, or captain of a squad playing in this division.
create or replace function public.can_manage_division(p_division bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.divisions d
     where d.id = p_division
       and (public.is_club_admin(d.club_id)
            or exists (select 1 from public.squads s
                        where s.division_id = d.id and s.captain_id = auth.uid()))
  )
$$;

-- The current season's table for a division, top first.
create or replace function public.league_table(p_division bigint)
returns table (
  "position"  int,   -- quoted: position is a reserved word in a function's column list
  team_name   text,
  played      int,
  points      int,
  is_own_team boolean,
  updated_at  timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.position, r.team_name, r.played, r.points, r.is_own_team, r.updated_at
  from public.league_table_rows r
  join public.divisions d on d.id = r.division_id
  join public.seasons s   on s.id = r.season_id and s.is_current
  where r.division_id = p_division
    and d.club_id = public.my_club_id()
  order by r.position
$$;

-- Replace a division's table for the current season, in one transaction.
-- p_rows is in table order (top first): [{team_name, played, points, is_own_team}].
-- Then copy each team's position onto this division's fixtures against them
-- that don't have a result yet. Fixtures with results keep the position
-- they were played at, so past form scores don't move.
-- Returns the number of fixtures whose league position changed.
create or replace function public.save_league_table(p_division bigint, p_rows jsonb)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club    bigint;
  v_season  bigint;
  v_updated int;
begin
  if not public.can_manage_division(p_division) then
    raise exception 'Only a captain in this division or a club admin can edit the league table';
  end if;

  select club_id into v_club from public.divisions where id = p_division;
  select id into v_season from public.seasons where club_id = v_club and is_current;
  if v_season is null then
    raise exception 'There is no current season. Ask a club admin to start one.';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'The league table must be a list of teams';
  end if;
  if jsonb_array_length(p_rows) > 40 then
    raise exception 'A league table can have up to 40 teams';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as e(v)
     where coalesce(btrim(e.v ->> 'team_name'), '') = ''
  ) then
    raise exception 'Every row needs a team name';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as e(v)
     group by lower(btrim(e.v ->> 'team_name')) having count(*) > 1
  ) then
    raise exception 'Each team can only appear once in the table';
  end if;

  delete from public.league_table_rows where division_id = p_division and season_id = v_season;

  -- Position = place in the list (top first).
  insert into public.league_table_rows (division_id, season_id, position, team_name, played, points, is_own_team, updated_by)
  select p_division, v_season, e.ord::int, btrim(e.v ->> 'team_name'),
         coalesce((e.v ->> 'played')::int, 0),
         coalesce((e.v ->> 'points')::int, 0),
         coalesce((e.v ->> 'is_own_team')::boolean, false),
         auth.uid()
    from jsonb_array_elements(p_rows) with ordinality as e(v, ord);

  update public.fixtures f
     set opponent_league_position = r.position
    from public.league_table_rows r
   where r.division_id = p_division
     and r.season_id = v_season
     and f.division_id = p_division
     and f.season_id = v_season
     and lower(btrim(f.opponent_name)) = lower(btrim(r.team_name))
     and f.opponent_league_position is distinct from r.position
     and not exists (select 1 from public.matches m where m.fixture_id = f.id);
  get diagnostics v_updated = row_count;

  return v_updated;
end;
$$;
