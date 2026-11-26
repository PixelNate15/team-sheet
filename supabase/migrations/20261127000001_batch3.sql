-- Feature batch 3: club chat and polls (one chat table for club and fixture
-- chats), drop-out alerts, result reminders and player-submitted results,
-- selection balance, away dates, the venue book and season awards.
-- Patterns as in batch 2: new tables are granted explicitly; internal
-- functions are revoked from the app.

-- =====================================================================
-- 1. Chat: one table for the club chat (fixture_id null) and fixture chats
-- =====================================================================
create table public.chat_messages (
  id         bigint generated always as identity primary key,
  club_id    bigint not null references public.clubs (id) on delete cascade,
  fixture_id bigint references public.fixtures (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  body       text   not null check (char_length(btrim(body)) between 1 and 1000),
  is_notice  boolean not null default false,
  -- A poll: {"options": ["…", "…"]}; the body is the question.
  poll       jsonb check (poll is null or (jsonb_typeof(poll -> 'options') = 'array'
                                           and jsonb_array_length(poll -> 'options') between 2 and 6)),
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (club_id, fixture_id, created_at);

-- Keep the batch 2 fixture chat history.
insert into public.chat_messages (club_id, fixture_id, user_id, body, is_notice, created_at)
select f.club_id, m.fixture_id, m.user_id, m.body, m.is_notice, m.created_at
  from public.fixture_messages m join public.fixtures f on f.id = m.fixture_id;
drop table public.fixture_messages;
drop function public.notify_fixture_notice();

alter table public.chat_messages enable row level security;
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (club_id = public.my_club_id());
-- Anyone in the club can chat and create polls. Notices: the squad's captain
-- (or an admin) in a fixture chat; club admins only in the club chat.
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and club_id = public.my_club_id()
    and (fixture_id is null or public.fixture_club(fixture_id) = club_id)
    and (not is_notice
         or (fixture_id is not null and public.can_manage_squad(public.fixture_squad(fixture_id)))
         or (fixture_id is null and public.is_club_admin(club_id)))
  );
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_club_admin(club_id)
    or (fixture_id is not null and public.can_manage_squad(public.fixture_squad(fixture_id)))
  );
grant select, insert, delete on public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_id_seq to authenticated;

-- Notices notify people: a fixture notice goes to the squad, a club notice to everyone.
create or replace function public.notify_chat_notice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
begin
  if not new.is_notice then
    return new;
  end if;
  if new.fixture_id is not null then
    select * into v_fixture from public.fixtures where id = new.fixture_id;
    perform public.send_push(
      array(select sp.user_id from public.squad_players sp
             where sp.squad_id = v_fixture.squad_id and sp.user_id <> new.user_id),
      'Notice: ' || (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name,
      left(new.body, 140),
      jsonb_build_object('type', 'fixture', 'fixture_id', new.fixture_id));
  else
    perform public.send_push(
      array(select cm.user_id from public.club_members cm
             where cm.club_id = new.club_id and cm.user_id <> new.user_id),
      'Club notice · ' || (select name from public.clubs where id = new.club_id),
      left(new.body, 140),
      jsonb_build_object('type', 'club_chat'));
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_chat_notice() from public, anon, authenticated;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public.notify_chat_notice();

-- Poll votes: one per person per poll, changeable.
create table public.chat_poll_votes (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  option     int    not null check (option between 0 and 5),
  voted_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_poll_votes enable row level security;
create policy chat_poll_votes_select on public.chat_poll_votes for select to authenticated
  using (exists (select 1 from public.chat_messages m where m.id = message_id and m.club_id = public.my_club_id()));
grant select on public.chat_poll_votes to authenticated;

-- Vote (or p_option null to take your vote back).
create or replace function public.vote_poll(p_message bigint, p_option int)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_poll jsonb;
begin
  select poll into v_poll from public.chat_messages
   where id = p_message and club_id = public.my_club_id();
  if v_poll is null then
    raise exception 'Poll not found';
  end if;
  if p_option is null then
    delete from public.chat_poll_votes where message_id = p_message and user_id = auth.uid();
    return;
  end if;
  if p_option < 0 or p_option >= jsonb_array_length(v_poll -> 'options') then
    raise exception 'That option isn''t in the poll';
  end if;
  insert into public.chat_poll_votes (message_id, user_id, option)
  values (p_message, auth.uid(), p_option)
  on conflict (message_id, user_id) do update set option = excluded.option, voted_at = now();
end;
$$;

-- =====================================================================
-- 2. Drop-out alerts
-- =====================================================================
-- The best player to replace someone: available for the fixture (squad or
-- borrowed), not already picked, not injured (unless they can play), highest form.
create or replace function public.suggest_replacement_raw(p_fixture bigint)
returns table (user_id uuid, name text, form numeric)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.first_name || ' ' || p.surname, public.form_score_raw(p.id)
    from public.availability a
    join public.profiles p on p.id = a.user_id
    left join public.injuries i on i.user_id = a.user_id and i.is_current
   where a.fixture_id = p_fixture and a.is_available
     and (i.id is null or i.can_play)
     and not exists (select 1 from public.team_selection_players t where t.fixture_id = p_fixture and t.user_id = a.user_id)
     and (exists (select 1 from public.squad_players sp where sp.user_id = a.user_id and sp.squad_id = public.fixture_squad(p_fixture))
          or exists (select 1 from public.fixture_borrowed_players b where b.user_id = a.user_id and b.fixture_id = p_fixture))
   order by public.form_score_raw(p.id) desc nulls last, p.first_name
   limit 1
$$;
revoke execute on function public.suggest_replacement_raw(bigint) from public, anon, authenticated;

create or replace function public.suggest_replacement(p_fixture bigint)
returns table (user_id uuid, name text, form numeric)
language sql stable security definer set search_path = ''
as $$
  select * from public.suggest_replacement_raw(p_fixture)
   where public.can_manage_squad(public.fixture_squad(p_fixture))
$$;

-- When a picked player says they can't play, tell the captain straight away.
create or replace function public.notify_dropout()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_captain uuid;
  v_name    text;
  v_sugg    record;
begin
  if new.is_available or (tg_op = 'UPDATE' and old.is_available = false) then
    return new;
  end if;
  select * into v_fixture from public.fixtures where id = new.fixture_id;
  if v_fixture.fixture_date < current_date
     or not exists (select 1 from public.team_selection_players where fixture_id = new.fixture_id and user_id = new.user_id) then
    return new;
  end if;
  select captain_id into v_captain from public.squads where id = v_fixture.squad_id;
  if v_captain is null or v_captain = new.user_id then
    return new;
  end if;
  select first_name into v_name from public.profiles where id = new.user_id;
  select * into v_sugg from public.suggest_replacement_raw(new.fixture_id);
  perform public.send_push(array[v_captain],
    v_name || ' can''t play ' || (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name,
    case when v_sugg.user_id is not null then 'Suggested replacement: ' || v_sugg.name || '.'
         else 'Nobody else is available. You could borrow someone from a lower team.' end,
    jsonb_build_object('type', 'fixture', 'fixture_id', new.fixture_id));
  return new;
end;
$$;
revoke execute on function public.notify_dropout() from public, anon, authenticated;
create trigger availability_dropout after insert or update of is_available on public.availability
  for each row execute function public.notify_dropout();

-- =====================================================================
-- 3. Result reminders and player-submitted results
-- =====================================================================
create table public.result_submissions (
  fixture_id   bigint primary key references public.fixtures (id) on delete cascade,
  submitted_by uuid references public.profiles (id) on delete set null,
  matches      jsonb not null,
  created_at   timestamptz not null default now()
);
alter table public.result_submissions enable row level security;
create policy result_submissions_select on public.result_submissions for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
grant select on public.result_submissions to authenticated;

-- A player in the team sends the scores; the captain checks and saves them.
-- Same checks as save_fixture_result, so the captain can save it as it is.
create or replace function public.submit_result(p_fixture bigint, p_matches jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_row     record;
  v_won     int;
  v_captain uuid;
  v_name    text;
begin
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v_fixture.id is null
     or not exists (select 1 from public.team_selection_players where fixture_id = p_fixture and user_id = auth.uid()) then
    raise exception 'Only players in the team can send the result';
  end if;
  if v_fixture.fixture_date > current_date then
    raise exception 'Results can only be sent once the fixture has been played';
  end if;
  if exists (select 1 from public.matches where fixture_id = p_fixture) then
    raise exception 'The captain has already entered this result';
  end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) <> 4 then
    raise exception 'A result needs all 4 rubbers';
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_matches) as x(
      rubber_number int, player_1 uuid, player_2 uuid,
      set_1_won int, set_1_lost int, set_2_won int, set_2_lost int, champ_tie text)
  loop
    if v_row.rubber_number not between 1 and 4 then
      raise exception 'Invalid rubber number';
    end if;
    if v_row.player_1 is null or v_row.player_2 is null or v_row.player_1 = v_row.player_2 then
      raise exception 'Rubber %: choose two different players', v_row.rubber_number;
    end if;
    if exists (select 1 from unnest(array[v_row.player_1, v_row.player_2]) as u(id)
                where not exists (select 1 from public.team_selection_players t where t.fixture_id = p_fixture and t.user_id = u.id)) then
      raise exception 'Rubber %: only players in the team can be entered', v_row.rubber_number;
    end if;
    if not public.is_valid_set(v_row.set_1_won, v_row.set_1_lost)
       or not public.is_valid_set(v_row.set_2_won, v_row.set_2_lost) then
      raise exception 'Rubber %: each set must finish 6-0 to 6-4, 7-5 or 7-6', v_row.rubber_number;
    end if;
    v_won := (v_row.set_1_won > v_row.set_1_lost)::int + (v_row.set_2_won > v_row.set_2_lost)::int;
    if v_won = 1 and (v_row.champ_tie is null or v_row.champ_tie not in ('W', 'L')) then
      raise exception 'Rubber %: sets are 1-1, so enter the champions tie-break result', v_row.rubber_number;
    end if;
    if v_won <> 1 and coalesce(v_row.champ_tie, '') <> '' then
      raise exception 'Rubber %: a champions tie-break is only played at one set all', v_row.rubber_number;
    end if;
  end loop;

  insert into public.result_submissions (fixture_id, submitted_by, matches)
  values (p_fixture, auth.uid(), p_matches)
  on conflict (fixture_id) do update set submitted_by = excluded.submitted_by, matches = excluded.matches, created_at = now();

  select captain_id into v_captain from public.squads where id = v_fixture.squad_id;
  select first_name into v_name from public.profiles where id = auth.uid();
  if v_captain is not null and v_captain <> auth.uid() then
    perform public.send_push(array[v_captain], 'Result sent: ' || v_fixture.opponent_name,
      v_name || ' sent the scores. Check them and save the result.',
      jsonb_build_object('type', 'result_submission', 'fixture_id', p_fixture));
  end if;
end;
$$;

-- Once the captain saves a result, the submission has done its job.
create or replace function public.clear_result_submission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.result_submissions where fixture_id = new.fixture_id;
  return new;
end;
$$;
revoke execute on function public.clear_result_submission() from public, anon, authenticated;
create trigger matches_clear_submission after insert on public.matches
  for each row execute function public.clear_result_submission();

-- Daily: remind captains about yesterday's fixtures that have no result yet.
create or replace function public.send_result_reminders(p_today date default current_date)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture record;
  v_total   int := 0;
begin
  for v_fixture in
    select f.id, f.opponent_name, f.is_home, s.captain_id
      from public.fixtures f join public.squads s on s.id = f.squad_id
     where f.fixture_date = p_today - 1
       and s.captain_id is not null
       and not exists (select 1 from public.matches m where m.fixture_id = f.id)
       and not exists (select 1 from public.result_submissions r where r.fixture_id = f.id)
  loop
    perform public.send_push(array[v_fixture.captain_id],
      'Result needed: ' || (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name,
      'Enter yesterday''s scores, or ask one of the players to send them.',
      jsonb_build_object('type', 'fixture', 'fixture_id', v_fixture.id));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.send_result_reminders(date) from public, anon, authenticated;
select cron.schedule('result-reminders', '0 9 * * *', $$select public.send_result_reminders()$$);

-- =====================================================================
-- 4. Selection balance
-- =====================================================================
-- This season, per squad player: fixtures they said yes to, times picked,
-- rubbers played and times they played up for a higher team.
create or replace function public.selection_balance(p_squad bigint)
returns table (user_id uuid, name text, said_yes int, picked int, rubbers int, played_up int, fixtures int)
language sql stable security definer set search_path = ''
as $$
  with season as (
    select se.id from public.squads s join public.seasons se on se.club_id = s.club_id and se.is_current
     where s.id = p_squad
  ), fx as (
    select f.id from public.fixtures f, season
     where f.squad_id = p_squad and f.season_id = season.id and f.fixture_date <= current_date
  )
  select p.id, p.first_name || ' ' || p.surname,
         (select count(*)::int from public.availability a where a.user_id = p.id and a.is_available and a.fixture_id in (select id from fx)),
         (select count(*)::int from public.team_selection_players t where t.user_id = p.id and t.fixture_id in (select id from fx)),
         (select count(*)::int from public.match_players mp join public.matches m on m.id = mp.match_id
           where mp.user_id = p.id and m.fixture_id in (select id from fx)),
         coalesce((select public.times_played_up(p.id, season.id) from season), 0),
         (select count(*)::int from fx)
    from public.squad_players sp
    join public.profiles p on p.id = sp.user_id
   where sp.squad_id = p_squad and public.can_manage_squad(p_squad)
   order by p.first_name, p.surname
$$;

-- =====================================================================
-- 5. Away dates
-- =====================================================================
create table public.away_periods (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  note       text check (char_length(note) <= 100),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index away_periods_user_idx on public.away_periods (user_id, ends_on);
alter table public.away_periods enable row level security;
create policy away_periods_select on public.away_periods for select to authenticated
  using (user_id = auth.uid() or public.same_club(user_id));
create policy away_periods_delete on public.away_periods for delete to authenticated
  using (user_id = auth.uid());
grant select, delete on public.away_periods to authenticated;

-- Marks replies written automatically, so they can be undone without touching real replies.
alter table public.availability add column source text check (source in ('away'));

-- Mark one player unavailable ("Away") for their fixtures in a date range, where they haven't replied.
create or replace function public.apply_away(p_user uuid, p_from date, p_to date, p_note text)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.availability (fixture_id, user_id, is_available, reason, source)
  select f.id, p_user, false, 'Away' || coalesce(': ' || nullif(btrim(p_note), ''), ''), 'away'
    from public.fixtures f
   where f.fixture_date between greatest(p_from, current_date) and p_to
     and (exists (select 1 from public.squad_players sp where sp.user_id = p_user and sp.squad_id = f.squad_id)
          or exists (select 1 from public.fixture_borrowed_players b where b.user_id = p_user and b.fixture_id = f.id))
  on conflict (fixture_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.apply_away(uuid, date, date, text) from public, anon, authenticated;

create or replace function public.add_away_period(p_from date, p_to date, p_note text default null)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_to < p_from then
    raise exception 'The end date is before the start date';
  end if;
  if p_to < current_date then
    raise exception 'Those dates are in the past';
  end if;
  insert into public.away_periods (user_id, starts_on, ends_on, note)
  values (auth.uid(), p_from, p_to, nullif(left(btrim(p_note), 100), ''));
  return public.apply_away(auth.uid(), p_from, p_to, p_note);
end;
$$;

-- Removing away dates clears the automatic "Away" replies they made
-- (unless another away period still covers that fixture).
create or replace function public.clear_away_replies()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.availability a
   using public.fixtures f
   where f.id = a.fixture_id
     and a.user_id = old.user_id and a.source = 'away' and not a.is_available
     and f.fixture_date between old.starts_on and old.ends_on and f.fixture_date >= current_date
     and not exists (select 1 from public.away_periods p
                      where p.user_id = old.user_id and p.id <> old.id
                        and f.fixture_date between p.starts_on and p.ends_on);
  return old;
end;
$$;
revoke execute on function public.clear_away_replies() from public, anon, authenticated;
create trigger away_periods_clear after delete on public.away_periods
  for each row execute function public.clear_away_replies();

-- New or moved fixtures pick up existing away dates.
create or replace function public.apply_away_to_fixture()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.fixture_date = old.fixture_date then
      return new;
    end if;
    delete from public.availability where fixture_id = new.id and source = 'away';
  end if;
  insert into public.availability (fixture_id, user_id, is_available, reason, source)
  select new.id, p.user_id, false, 'Away' || coalesce(': ' || p.note, ''), 'away'
    from public.away_periods p
    join public.squad_players sp on sp.user_id = p.user_id and sp.squad_id = new.squad_id
   where new.fixture_date between p.starts_on and p.ends_on
  on conflict (fixture_id, user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.apply_away_to_fixture() from public, anon, authenticated;
create trigger fixtures_apply_away after insert or update of fixture_date on public.fixtures
  for each row execute function public.apply_away_to_fixture();

-- =====================================================================
-- 6. Venue book
-- =====================================================================
create table public.venues (
  id         bigint generated always as identity primary key,
  club_id    bigint not null references public.clubs (id) on delete cascade,
  name       text   not null check (char_length(btrim(name)) between 1 and 100),
  address    text   not null check (char_length(btrim(address)) between 1 and 200),
  notes      text   check (char_length(notes) <= 500),
  updated_by uuid   references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index venues_name_unique on public.venues (club_id, lower(btrim(name)));

-- Captains of any team in the club, or admins.
create or replace function public.can_edit_venues(p_club bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_club_admin(p_club)
      or exists (select 1 from public.squads s where s.club_id = p_club and s.captain_id = auth.uid())
$$;

alter table public.venues enable row level security;
create policy venues_select on public.venues for select to authenticated
  using (club_id = public.my_club_id());
create policy venues_write on public.venues for all to authenticated
  using (club_id = public.my_club_id() and public.can_edit_venues(club_id))
  with check (club_id = public.my_club_id() and public.can_edit_venues(club_id));
grant select, insert, update, delete on public.venues to authenticated;
grant usage, select on sequence public.venues_id_seq to authenticated;

-- =====================================================================
-- 7. Season awards
-- =====================================================================
create or replace function public.season_awards(p_season bigint)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_season public.seasons%rowtype;
begin
  select * into v_season from public.seasons where id = p_season;
  if v_season.id is null or v_season.club_id is distinct from public.my_club_id() then
    raise exception 'Season not found';
  end if;
  if not exists (select 1 from public.squads s where s.club_id = v_season.club_id and public.can_manage_squad(s.id)) then
    raise exception 'Only captains and club admins can see the season awards';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('squad', s.name, 'awards', a.awards) order by s.ranking)
      from public.squads s
      cross join lateral (
        select coalesce(jsonb_agg(x.award) filter (where x.award is not null), '[]'::jsonb) as awards
          from (
            -- Most wins (rubbers won)
            (select jsonb_build_object('title', 'Most wins', 'winner', p.first_name || ' ' || p.surname,
                                       'detail', count(*) filter (where m.did_win) || ' of ' || count(*) || ' rubbers') as award
               from public.match_players mp
               join public.matches m on m.id = mp.match_id
               join public.fixtures f on f.id = m.fixture_id
               join public.profiles p on p.id = mp.user_id
              where f.squad_id = s.id and f.season_id = p_season
              group by p.id, p.first_name, p.surname
             having count(*) filter (where m.did_win) > 0
              order by count(*) filter (where m.did_win) desc, count(*) asc
              limit 1)
            union all
            -- Best partnership (3+ rubbers together)
            (select jsonb_build_object('title', 'Best partnership',
                                       'winner', p1.first_name || ' & ' || p2.first_name,
                                       'detail', count(*) filter (where m.did_win) || ' of ' || count(*) || ' rubbers won') as award
               from public.match_players mp
               join public.matches m on m.id = mp.match_id
               join public.fixtures f on f.id = m.fixture_id
               join public.profiles p1 on p1.id = mp.user_id
               join public.profiles p2 on p2.id = mp.partner_user_id
              where f.squad_id = s.id and f.season_id = p_season and mp.user_id < mp.partner_user_id
              group by p1.id, p2.id, p1.first_name, p2.first_name
             having count(*) >= 3
              order by count(*) filter (where m.did_win)::numeric / count(*) desc, count(*) desc
              limit 1)
            union all
            -- Ever-present (most fixtures played)
            (select jsonb_build_object('title', 'Ever-present', 'winner', p.first_name || ' ' || p.surname,
                                       'detail', count(distinct m.fixture_id) || ' fixtures played') as award
               from public.match_players mp
               join public.matches m on m.id = mp.match_id
               join public.fixtures f on f.id = m.fixture_id
               join public.profiles p on p.id = mp.user_id
              where f.squad_id = s.id and f.season_id = p_season
              group by p.id, p.first_name, p.surname
              order by count(distinct m.fixture_id) desc, p.first_name
              limit 1)
            union all
            -- Most improved form (form before the season's first fixture vs now)
            (select jsonb_build_object('title', 'Most improved', 'winner', y.name,
                                       'detail', 'Form ' || to_char(y.before, 'FM0.00') || ' → ' || to_char(y.now, 'FM0.00')) as award
               from (
                 select p.first_name || ' ' || p.surname as name,
                        public.form_score_raw(p.id, (select min(f2.fixture_date) from public.fixtures f2
                                                       where f2.squad_id = s.id and f2.season_id = p_season)) as before,
                        public.form_score_raw(p.id) as now
                   from public.match_players mp
                   join public.matches m on m.id = mp.match_id
                   join public.fixtures f on f.id = m.fixture_id
                   join public.profiles p on p.id = mp.user_id
                  where f.squad_id = s.id and f.season_id = p_season
                  group by p.id, p.first_name, p.surname
                 having count(distinct m.fixture_id) >= 2
               ) y
              where y.before is not null and y.now > y.before
              order by y.now - y.before desc
              limit 1)
            union all
            -- Top-rated partner (average overall feedback, 3+ ratings)
            (select jsonb_build_object('title', 'Top-rated partner', 'winner', p.first_name || ' ' || p.surname,
                                       'detail', to_char(avg(pf.overall_rating), 'FM90.0') || '/10 from ' || count(*) || ' ratings') as award
               from public.partner_feedback pf
               join public.matches m on m.id = pf.match_id
               join public.fixtures f on f.id = m.fixture_id
               join public.profiles p on p.id = pf.reviewed_id
              where f.squad_id = s.id and f.season_id = p_season
              group by p.id, p.first_name, p.surname
             having count(*) >= 3
              order by avg(pf.overall_rating) desc, count(*) desc
              limit 1)
          ) x
      ) a
     where s.club_id = v_season.club_id and public.can_manage_squad(s.id)
  ), '[]'::jsonb);
end;
$$;
