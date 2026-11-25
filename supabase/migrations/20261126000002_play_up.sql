-- Playing up: when a team is short for a fixture, its captain can borrow a
-- player from a lower-ranked team for that one match. Each player can be
-- borrowed at most twice per season (decision 31). Team selection is now
-- limited to the team's own players plus players borrowed for that fixture,
-- so the limit can't be side-stepped.

create table public.fixture_borrowed_players (
  fixture_id    bigint not null references public.fixtures (id) on delete cascade,
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  from_squad_id bigint references public.squads (id) on delete set null,
  borrowed_by   uuid   references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (fixture_id, user_id)
);
create index fixture_borrowed_players_user_idx on public.fixture_borrowed_players (user_id);

alter table public.fixture_borrowed_players enable row level security;
create policy borrowed_players_select on public.fixture_borrowed_players for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
grant select on public.fixture_borrowed_players to authenticated;

-- How many times a player has been borrowed in a season (the rule allows 2).
create or replace function public.times_played_up(p_user uuid, p_season bigint)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
    from public.fixture_borrowed_players b
    join public.fixtures f on f.id = b.fixture_id
   where b.user_id = p_user and f.season_id = p_season
$$;

-- Available players a fixture's own team has (said yes, not injured unless they can play).
create or replace function public.squad_available_count(p_fixture bigint)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
    from public.fixtures f
    join public.squad_players sp on sp.squad_id = f.squad_id
    join public.availability a on a.fixture_id = f.id and a.user_id = sp.user_id and a.is_available
    left join public.injuries i on i.user_id = sp.user_id and i.is_current
   where f.id = p_fixture and (i.id is null or i.can_play)
$$;
revoke execute on function public.squad_available_count(bigint) from public, anon, authenticated;

create or replace function public.borrow_player(p_fixture bigint, p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture   public.fixtures%rowtype;
  v_ranking   int;
  v_from      bigint;
  v_from_rank int;
  v_name      text;
  v_have      int;
begin
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v_fixture.id is null or not public.can_manage_squad(v_fixture.squad_id) then
    raise exception 'Only the squad captain can borrow players';
  end if;
  if v_fixture.fixture_date < current_date then
    raise exception 'This fixture has already been played';
  end if;
  if v_fixture.season_id is null then
    raise exception 'This fixture isn''t in a season';
  end if;
  if exists (select 1 from public.fixture_borrowed_players where fixture_id = p_fixture and user_id = p_user) then
    return;
  end if;

  select ranking into v_ranking from public.squads where id = v_fixture.squad_id;
  select sp.squad_id, s.ranking into v_from, v_from_rank
    from public.squad_players sp join public.squads s on s.id = sp.squad_id
   where sp.user_id = p_user and s.club_id = v_fixture.club_id;
  if v_from is null or v_from_rank <= v_ranking then
    raise exception 'You can only borrow players from a lower team';
  end if;

  v_have := public.squad_available_count(p_fixture)
            + (select count(*) from public.fixture_borrowed_players where fixture_id = p_fixture);
  if v_have >= 4 then
    raise exception 'You already have 4 available players for this fixture';
  end if;

  select first_name || ' ' || surname into v_name from public.profiles where id = p_user;
  if public.times_played_up(p_user, v_fixture.season_id) >= 2 then
    raise exception '% has already played up twice this season', v_name;
  end if;

  insert into public.fixture_borrowed_players (fixture_id, user_id, from_squad_id, borrowed_by)
  values (p_fixture, p_user, v_from, auth.uid());
  -- The captain borrows someone who's agreed to play, so mark them available (they can change it).
  insert into public.availability (fixture_id, user_id, is_available)
  values (p_fixture, p_user, true)
  on conflict (fixture_id, user_id) do update set is_available = true, reason = null, submitted_at = now();

  perform public.send_push(array[p_user], 'You''re playing up',
    (select name from public.squads where id = v_fixture.squad_id) || ' need you '
      || (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name
      || ' on ' || to_char(v_fixture.fixture_date, 'Dy DD Mon') || '.',
    jsonb_build_object('type', 'fixture', 'fixture_id', p_fixture));
end;
$$;

-- Undo a borrow before the match (it then doesn't count towards the limit).
create or replace function public.release_borrowed_player(p_fixture bigint, p_user uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
begin
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v_fixture.id is null or not public.can_manage_squad(v_fixture.squad_id) then
    raise exception 'Only the squad captain can do this';
  end if;
  if v_fixture.fixture_date < current_date then
    raise exception 'This fixture has already been played';
  end if;
  delete from public.fixture_borrowed_players where fixture_id = p_fixture and user_id = p_user;
  delete from public.team_selection_players where fixture_id = p_fixture and user_id = p_user;
  delete from public.availability where fixture_id = p_fixture and user_id = p_user;
end;
$$;

-- Players a captain could borrow for a fixture: everyone in lower teams, with
-- how often they've played up this season and whether they're injured.
create or replace function public.borrowable_players(p_fixture bigint)
returns table (user_id uuid, first_name text, surname text, squad_name text, form numeric,
               times_played_up int, limit_reached boolean, borrowed boolean, injured boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.first_name, p.surname, s.name, public.form_score(p.id),
         public.times_played_up(p.id, f.season_id),
         public.times_played_up(p.id, f.season_id) >= 2,
         exists (select 1 from public.fixture_borrowed_players b where b.fixture_id = f.id and b.user_id = p.id),
         exists (select 1 from public.injuries i where i.user_id = p.id and i.is_current and not i.can_play)
    from public.fixtures f
    join public.squads own on own.id = f.squad_id
    join public.squads s on s.club_id = f.club_id and s.ranking > own.ranking
    join public.squad_players sp on sp.squad_id = s.id
    join public.profiles p on p.id = sp.user_id
   where f.id = p_fixture and public.can_manage_squad(f.squad_id)
   order by s.ranking, public.form_score(p.id) desc nulls last, p.first_name
$$;

-- Borrowed players can reply to availability for the fixture they're borrowed for.
drop policy availability_write on public.availability;
create policy availability_write on public.availability for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      exists (select 1 from public.squad_players sp
               where sp.user_id = auth.uid() and sp.squad_id = public.fixture_squad(fixture_id))
      or exists (select 1 from public.fixture_borrowed_players b
                  where b.user_id = auth.uid() and b.fixture_id = availability.fixture_id)
    )
  );

-- Captain's replies list: the squad plus anyone borrowed (flagged).
drop function public.fixture_availability(bigint);
create function public.fixture_availability(p_fixture bigint)
returns table (
  user_id          uuid,
  first_name       text,
  surname          text,
  is_available     boolean,
  reason           text,
  injury           text,
  injury_can_play  boolean,
  borrowed_from    text
)
language sql stable security definer set search_path = ''
as $$
  with people as (
    select sp.user_id, null::text as borrowed_from
      from public.fixtures f join public.squad_players sp on sp.squad_id = f.squad_id
     where f.id = p_fixture
    union
    select b.user_id, s.name
      from public.fixture_borrowed_players b left join public.squads s on s.id = b.from_squad_id
     where b.fixture_id = p_fixture
  )
  select p.id, p.first_name, p.surname, a.is_available, a.reason, i.description, i.can_play, x.borrowed_from
  from people x
  join public.fixtures f on f.id = p_fixture
  join public.profiles p on p.id = x.user_id
  left join public.availability a on a.fixture_id = f.id and a.user_id = p.id
  left join public.injuries i on i.user_id = p.id and i.is_current
  where f.club_id = public.my_club_id()
  order by a.is_available desc nulls last, p.first_name
$$;

-- Player's fixture list: their own team's fixtures plus any they're borrowed for.
drop function public.my_fixtures();
create function public.my_fixtures()
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
  team_selected    boolean,
  is_borrowed      boolean
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
    f.team_selected_at is not null,
    b.user_id is not null
  from public.fixtures f
  join public.squads s on s.id = f.squad_id
  left join public.divisions d on d.id = f.division_id
  left join public.fixture_borrowed_players b on b.fixture_id = f.id and b.user_id = auth.uid()
  left join public.availability a on a.fixture_id = f.id and a.user_id = auth.uid()
  left join public.team_selection_players tsp on tsp.fixture_id = f.id and tsp.user_id = auth.uid()
  where f.fixture_date >= current_date
    and (b.user_id is not null
         or exists (select 1 from public.squad_players sp where sp.user_id = auth.uid() and sp.squad_id = f.squad_id))
  order by f.fixture_date, f.start_time
$$;

-- save_fixture: unchanged apart from the selection rule described at the top.
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

    -- Only the squad's own players, plus anyone borrowed for this fixture
    -- (borrow_player enforces the twice-a-season limit).
    if exists (
      select 1 from public.team_selection_players t
       where t.fixture_id = v_id
         and not exists (select 1 from public.squad_players sp
                          where sp.user_id = t.user_id and sp.squad_id = public.fixture_squad(v_id))
         and not exists (select 1 from public.fixture_borrowed_players b
                          where b.user_id = t.user_id and b.fixture_id = v_id)
    ) then
      raise exception 'Only players in this team, or players borrowed for this fixture, can be selected';
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
