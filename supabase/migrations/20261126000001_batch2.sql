-- Feature batch 2: lift-sharing, fixture notices and chat, match fees,
-- profile photos, player import as invites, and the season report.
-- New tables get no API privileges automatically (see 20261123000003_grants.sql),
-- so each one is granted explicitly. New functions are callable by signed-in
-- users unless revoked (default privileges from 20261123000004).

-- =====================================================================
-- 1. Lift-sharing
-- =====================================================================
-- One row per player per fixture: either offering seats or needing a lift.
-- A passenger's driver_id is set when a driver takes them.
create table public.fixture_lifts (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  kind       text   not null check (kind in ('offer', 'need')),
  seats      int    check (seats between 1 and 8),
  note       text   check (char_length(note) <= 200),
  driver_id  uuid   references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (fixture_id, user_id),
  check ((kind = 'offer' and seats is not null and driver_id is null)
      or (kind = 'need' and seats is null))
);
create index fixture_lifts_driver_idx on public.fixture_lifts (fixture_id, driver_id);

alter table public.fixture_lifts enable row level security;
-- Read: the fixture's club. Writes only through the functions below.
create policy fixture_lifts_select on public.fixture_lifts for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
grant select on public.fixture_lifts to authenticated;

-- Shared checks for lift changes: signed in, same club, fixture not yet played.
create or replace function public.lift_fixture_check(p_fixture bigint)
returns public.fixtures
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
begin
  select * into v_fixture from public.fixtures where id = p_fixture;
  if v_fixture.id is null or v_fixture.club_id is distinct from public.my_club_id() then
    raise exception 'Fixture not found';
  end if;
  if v_fixture.fixture_date < current_date then
    raise exception 'This fixture has already been played';
  end if;
  return v_fixture;
end;
$$;
revoke execute on function public.lift_fixture_check(bigint) from public, anon, authenticated;

-- Offer seats (p_kind 'offer'), ask for a lift ('need'), or withdraw (null).
create or replace function public.set_my_lift(p_fixture bigint, p_kind text, p_seats int default null, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_current public.fixture_lifts%rowtype;
  v_taken   int;
begin
  perform public.lift_fixture_check(p_fixture);
  select * into v_current from public.fixture_lifts where fixture_id = p_fixture and user_id = auth.uid();

  -- Leaving the driver role (withdrawing or switching to "need") frees any passengers.
  if v_current.kind = 'offer' and (p_kind is null or p_kind <> 'offer') then
    update public.fixture_lifts set driver_id = null, updated_at = now()
     where fixture_id = p_fixture and driver_id = auth.uid();
  end if;

  if p_kind is null then
    delete from public.fixture_lifts where fixture_id = p_fixture and user_id = auth.uid();
    return;
  end if;

  if p_kind = 'offer' then
    if p_seats is null or p_seats not between 1 and 8 then
      raise exception 'Choose how many seats you can offer (1-8)';
    end if;
    select count(*) into v_taken from public.fixture_lifts where fixture_id = p_fixture and driver_id = auth.uid();
    if v_taken > p_seats then
      raise exception 'You already have % passengers; drop one first', v_taken;
    end if;
    insert into public.fixture_lifts (fixture_id, user_id, kind, seats, note, driver_id, updated_at)
    values (p_fixture, auth.uid(), 'offer', p_seats, nullif(btrim(p_note), ''), null, now())
    on conflict (fixture_id, user_id) do update
      set kind = 'offer', seats = excluded.seats, note = excluded.note, driver_id = null, updated_at = now();
  elsif p_kind = 'need' then
    insert into public.fixture_lifts (fixture_id, user_id, kind, seats, note, driver_id, updated_at)
    values (p_fixture, auth.uid(), 'need', null, nullif(btrim(p_note), ''), null, now())
    on conflict (fixture_id, user_id) do update
      set kind = 'need', seats = null, note = excluded.note,
          driver_id = case when public.fixture_lifts.kind = 'need' then public.fixture_lifts.driver_id end,
          updated_at = now();
  else
    raise exception 'Unknown lift type';
  end if;
end;
$$;

-- A driver takes a passenger who needs a lift.
create or replace function public.take_passenger(p_fixture bigint, p_passenger uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_seats   int;
  v_taken   int;
  v_driver  text;
begin
  v_fixture := public.lift_fixture_check(p_fixture);
  select seats into v_seats from public.fixture_lifts
   where fixture_id = p_fixture and user_id = auth.uid() and kind = 'offer';
  if v_seats is null then
    raise exception 'Offer a lift first';
  end if;
  select count(*) into v_taken from public.fixture_lifts where fixture_id = p_fixture and driver_id = auth.uid();
  if v_taken >= v_seats then
    raise exception 'Your car is full';
  end if;

  update public.fixture_lifts set driver_id = auth.uid(), updated_at = now()
   where fixture_id = p_fixture and user_id = p_passenger and kind = 'need' and driver_id is null;
  if not found then
    raise exception 'That player doesn''t need a lift any more';
  end if;

  select first_name into v_driver from public.profiles where id = auth.uid();
  perform public.send_push(array[p_passenger], 'You''ve got a lift',
    v_driver || ' will drive you to ' || v_fixture.opponent_name || ' on ' || to_char(v_fixture.fixture_date, 'Dy DD Mon') || '.',
    jsonb_build_object('type', 'fixture', 'fixture_id', p_fixture));
end;
$$;

-- The driver or the passenger cancels a lift that was arranged.
create or replace function public.drop_passenger(p_fixture bigint, p_passenger uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.lift_fixture_check(p_fixture);
  update public.fixture_lifts set driver_id = null, updated_at = now()
   where fixture_id = p_fixture and user_id = p_passenger
     and driver_id is not null
     and (driver_id = auth.uid() or user_id = auth.uid());
  if not found then
    raise exception 'Only the driver or the passenger can cancel this lift';
  end if;
end;
$$;

-- Everything the lifts section shows, with names and seats left.
create or replace function public.lift_board(p_fixture bigint)
returns table (
  user_id     uuid,
  name        text,
  kind        text,
  seats       int,
  seats_taken int,
  note        text,
  driver_id   uuid,
  driver_name text
)
language sql stable security definer set search_path = ''
as $$
  select l.user_id, p.first_name || ' ' || p.surname, l.kind, l.seats,
         case when l.kind = 'offer'
              then (select count(*)::int from public.fixture_lifts x where x.fixture_id = l.fixture_id and x.driver_id = l.user_id) end,
         l.note, l.driver_id,
         d.first_name || ' ' || d.surname
    from public.fixture_lifts l
    join public.profiles p on p.id = l.user_id
    left join public.profiles d on d.id = l.driver_id
   where l.fixture_id = p_fixture
     and public.fixture_club(p_fixture) = public.my_club_id()
   order by l.kind desc, p.first_name, p.surname
$$;

-- =====================================================================
-- 2. Fixture notices and chat
-- =====================================================================
create table public.fixture_messages (
  id         bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  body       text   not null check (char_length(btrim(body)) between 1 and 1000),
  is_notice  boolean not null default false,
  created_at timestamptz not null default now()
);
create index fixture_messages_fixture_idx on public.fixture_messages (fixture_id, created_at);

alter table public.fixture_messages enable row level security;
create policy fixture_messages_select on public.fixture_messages for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
-- Anyone in the club can chat; only the squad's captain (or an admin) can post a notice.
create policy fixture_messages_insert on public.fixture_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.fixture_club(fixture_id) = public.my_club_id()
    and (not is_notice or public.can_manage_squad(public.fixture_squad(fixture_id)))
  );
-- Delete your own messages; captains can remove any in their squad's fixtures.
create policy fixture_messages_delete on public.fixture_messages for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_squad(public.fixture_squad(fixture_id)));
grant select, insert, delete on public.fixture_messages to authenticated;
grant usage, select on sequence public.fixture_messages_id_seq to authenticated;

-- Notices are pushed to the squad (chat messages aren't, to avoid noise).
create or replace function public.notify_fixture_notice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
begin
  if new.is_notice then
    select * into v_fixture from public.fixtures where id = new.fixture_id;
    perform public.send_push(
      array(select sp.user_id from public.squad_players sp
             where sp.squad_id = v_fixture.squad_id and sp.user_id <> new.user_id),
      'Notice: ' || (case when v_fixture.is_home then 'vs ' else '@ ' end) || v_fixture.opponent_name,
      left(new.body, 140),
      jsonb_build_object('type', 'fixture', 'fixture_id', new.fixture_id));
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_fixture_notice() from public, anon, authenticated;

create trigger fixture_messages_notify
  after insert on public.fixture_messages
  for each row execute function public.notify_fixture_notice();

-- =====================================================================
-- 3. Match fees
-- =====================================================================
alter table public.squads   add column default_match_fee_pence int check (default_match_fee_pence between 0 and 100000);
alter table public.fixtures add column match_fee_pence         int check (match_fee_pence between 0 and 100000);

-- Who has paid for which fixture. Only captains (or admins) mark payments.
create table public.fixture_fee_payments (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  paid_at    timestamptz not null default now(),
  marked_by  uuid references public.profiles (id) on delete set null,
  primary key (fixture_id, user_id)
);
alter table public.fixture_fee_payments enable row level security;
create policy fee_payments_select on public.fixture_fee_payments for select to authenticated
  using (user_id = auth.uid() or public.can_manage_squad(public.fixture_squad(fixture_id)));
grant select on public.fixture_fee_payments to authenticated;

create or replace function public.set_fixture_fee(p_fixture bigint, p_fee_pence int)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.can_manage_squad(public.fixture_squad(p_fixture)) then
    raise exception 'Only the squad captain can set the match fee';
  end if;
  if p_fee_pence is not null and p_fee_pence not between 0 and 100000 then
    raise exception 'Enter a fee between £0 and £1,000';
  end if;
  update public.fixtures set match_fee_pence = nullif(p_fee_pence, 0) where id = p_fixture;
end;
$$;

create or replace function public.set_fee_paid(p_fixture bigint, p_user uuid, p_paid boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.can_manage_squad(public.fixture_squad(p_fixture)) then
    raise exception 'Only the squad captain can record payments';
  end if;
  if p_paid then
    if not exists (select 1 from public.team_selection_players where fixture_id = p_fixture and user_id = p_user) then
      raise exception 'Only players in the team pay the match fee';
    end if;
    insert into public.fixture_fee_payments (fixture_id, user_id, marked_by)
    values (p_fixture, p_user, auth.uid())
    on conflict (fixture_id, user_id) do nothing;
  else
    delete from public.fixture_fee_payments where fixture_id = p_fixture and user_id = p_user;
  end if;
end;
$$;

-- The fee for one fixture: every selected player for the captain, or just yourself.
create or replace function public.fixture_fees(p_fixture bigint)
returns table (user_id uuid, name text, fee_pence int, paid boolean, paid_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.user_id, p.first_name || ' ' || p.surname, f.match_fee_pence,
         pay.user_id is not null, pay.paid_at
    from public.fixtures f
    join public.team_selection_players t on t.fixture_id = f.id
    join public.profiles p on p.id = t.user_id
    left join public.fixture_fee_payments pay on pay.fixture_id = f.id and pay.user_id = t.user_id
   where f.id = p_fixture
     and f.match_fee_pence is not null
     and f.club_id = public.my_club_id()
     and (t.user_id = auth.uid() or public.can_manage_squad(f.squad_id))
   order by t.pair_number, t.selection_order
$$;

-- Your match fees over the last year (fixtures you were picked for that have a fee).
create or replace function public.my_fees()
returns table (fixture_id bigint, opponent_name text, is_home boolean, fixture_date date,
               fee_pence int, paid boolean, paid_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.opponent_name, f.is_home, f.fixture_date, f.match_fee_pence,
         pay.user_id is not null, pay.paid_at
    from public.team_selection_players t
    join public.fixtures f on f.id = t.fixture_id
    left join public.fixture_fee_payments pay on pay.fixture_id = f.id and pay.user_id = t.user_id
   where t.user_id = auth.uid()
     and f.match_fee_pence is not null
     and f.fixture_date >= current_date - 365
   order by f.fixture_date desc
$$;

-- Unpaid fees for fixtures already played, per player, for a captain.
create or replace function public.squad_fees_outstanding(p_squad bigint)
returns table (user_id uuid, name text, fixtures_owed int, amount_pence int)
language sql stable security definer set search_path = ''
as $$
  select t.user_id, p.first_name || ' ' || p.surname, count(*)::int, sum(f.match_fee_pence)::int
    from public.fixtures f
    join public.team_selection_players t on t.fixture_id = f.id
    join public.profiles p on p.id = t.user_id
   where f.squad_id = p_squad
     and public.can_manage_squad(p_squad)
     and f.match_fee_pence is not null
     and f.fixture_date <= current_date
     and not exists (select 1 from public.fixture_fee_payments pay where pay.fixture_id = f.id and pay.user_id = t.user_id)
   group by t.user_id, p.first_name, p.surname
   order by sum(f.match_fee_pence) desc, p.first_name
$$;

-- =====================================================================
-- 4. Profile photos
-- =====================================================================
-- The path inside the public "avatars" bucket, always in the player's own folder.
alter table public.profiles add column avatar_path text
  check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 200));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Players can only add, replace or remove files in their own folder.
create policy "avatars: own folder select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "avatars: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "avatars: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "avatars: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- =====================================================================
-- 5. Player import as invites
-- =====================================================================
-- An admin imports names and emails. When someone signs up with that email,
-- the app offers to put them straight into the club (and squad).
create table public.club_invites (
  id          bigint generated always as identity primary key,
  club_id     bigint not null references public.clubs (id) on delete cascade,
  email       text   not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  first_name  text   check (char_length(first_name) <= 50),
  surname     text   check (char_length(surname) <= 50),
  squad_id    bigint references public.squads (id) on delete set null,
  invited_by  uuid   references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);
create unique index club_invites_email_unique on public.club_invites (club_id, lower(email));

alter table public.club_invites enable row level security;
create policy club_invites_select on public.club_invites for select to authenticated
  using (public.is_club_admin(club_id));
create policy club_invites_delete on public.club_invites for delete to authenticated
  using (public.is_club_admin(club_id) and accepted_at is null);
grant select, delete on public.club_invites to authenticated;

-- p_rows: [{email, first_name, surname, squad_id}]. Returns counts.
create or replace function public.import_invites(p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club    bigint := public.my_club_id();
  v_row     record;
  v_email   text;
  v_added   int := 0;
  v_updated int := 0;
  v_members int := 0;
  v_invalid int := 0;
begin
  if v_club is null or not public.is_club_admin(v_club) then
    raise exception 'Only club admins can import players';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Import up to 500 players at a time';
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(email text, first_name text, surname text, squad_id bigint)
  loop
    v_email := lower(btrim(coalesce(v_row.email, '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      v_invalid := v_invalid + 1;
      continue;
    end if;
    if exists (select 1 from public.club_members cm join auth.users u on u.id = cm.user_id
                where cm.club_id = v_club and lower(u.email) = v_email) then
      v_members := v_members + 1;
      continue;
    end if;
    if v_row.squad_id is not null and not exists (select 1 from public.squads where id = v_row.squad_id and club_id = v_club) then
      v_row.squad_id := null;
    end if;

    if exists (select 1 from public.club_invites where club_id = v_club and lower(email) = v_email) then
      update public.club_invites
         set first_name = nullif(left(btrim(v_row.first_name), 50), ''),
             surname = nullif(left(btrim(v_row.surname), 50), ''),
             squad_id = v_row.squad_id
       where club_id = v_club and lower(email) = v_email and accepted_at is null;
      v_updated := v_updated + 1;
    else
      insert into public.club_invites (club_id, email, first_name, surname, squad_id, invited_by)
      values (v_club, v_email, nullif(left(btrim(v_row.first_name), 50), ''),
              nullif(left(btrim(v_row.surname), 50), ''), v_row.squad_id, auth.uid());
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'updated', v_updated,
                            'already_members', v_members, 'invalid', v_invalid);
end;
$$;

-- Pending invites for the signed-in user's email (only while they're not in a club).
create or replace function public.my_invites()
returns table (invite_id bigint, club_id bigint, club_name text, squad_name text)
language sql stable security definer set search_path = ''
as $$
  select i.id, c.id, c.name, s.name
    from public.club_invites i
    join public.clubs c on c.id = i.club_id
    left join public.squads s on s.id = i.squad_id
   where i.accepted_at is null
     and lower(i.email) = (select lower(email) from auth.users where id = auth.uid())
     and not exists (select 1 from public.club_members where user_id = auth.uid())
   order by i.created_at desc
$$;

create or replace function public.accept_invite(p_invite bigint)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_invite public.club_invites%rowtype;
begin
  select * into v_invite from public.club_invites where id = p_invite and accepted_at is null;
  if v_invite.id is null
     or lower(v_invite.email) <> (select lower(email) from auth.users where id = auth.uid()) then
    raise exception 'That invite isn''t for this account';
  end if;
  if exists (select 1 from public.club_members where user_id = auth.uid()) then
    raise exception 'You are already a member of a club';
  end if;

  insert into public.club_members (club_id, user_id, role) values (v_invite.club_id, auth.uid(), 'member');
  if v_invite.squad_id is not null then
    insert into public.squad_players (user_id, squad_id) values (auth.uid(), v_invite.squad_id)
    on conflict (user_id) do nothing;
  end if;
  update public.club_invites set accepted_at = now(), accepted_by = auth.uid() where id = p_invite;
  return v_invite.club_id;
end;
$$;

-- =====================================================================
-- 6. Season report
-- =====================================================================
-- Everything the season report PDF shows, for the squads the caller manages
-- (all squads for an admin).
create or replace function public.season_report(p_season bigint)
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
    raise exception 'Only captains and club admins can see the season report';
  end if;

  return jsonb_build_object(
    'club', (select name from public.clubs where id = v_season.club_id),
    'season', v_season.name,
    'generated_at', now(),
    'squads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.name,
        'division', d.name,
        'fixtures', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'date', f.fixture_date, 'opponent', f.opponent_name, 'is_home', f.is_home,
                   'sets_won', r.won, 'sets_lost', r.lost) order by f.fixture_date)
            from public.fixtures f
            left join lateral (
              select sum(m.sets_won)::int as won, sum(m.sets_lost)::int as lost
                from public.matches m where m.fixture_id = f.id
            ) r on true
           where f.squad_id = s.id and f.season_id = p_season), '[]'::jsonb),
        'players', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'name', x.name, 'fixtures', x.fixtures, 'rubbers', x.rubbers, 'wins', x.wins,
                   'form', public.form_score(x.user_id)) order by x.wins desc, x.rubbers desc, x.name)
            from (
              select mp.user_id, p.first_name || ' ' || p.surname as name,
                     count(distinct m.fixture_id)::int as fixtures,
                     count(*)::int as rubbers,
                     count(*) filter (where m.did_win)::int as wins
                from public.match_players mp
                join public.matches m on m.id = mp.match_id
                join public.fixtures f on f.id = m.fixture_id
                join public.profiles p on p.id = mp.user_id
               where f.squad_id = s.id and f.season_id = p_season
               group by mp.user_id, p.first_name, p.surname
            ) x), '[]'::jsonb),
        'fees_outstanding_pence', coalesce((
          select sum(f.match_fee_pence)::int
            from public.fixtures f
            join public.team_selection_players t on t.fixture_id = f.id
           where f.squad_id = s.id and f.season_id = p_season
             and f.match_fee_pence is not null and f.fixture_date <= current_date
             and not exists (select 1 from public.fixture_fee_payments pay
                              where pay.fixture_id = f.id and pay.user_id = t.user_id)), 0)
      ) order by s.ranking)
        from public.squads s
        left join public.divisions d on d.id = s.division_id
       where s.club_id = v_season.club_id and public.can_manage_squad(s.id)), '[]'::jsonb)
  );
end;
$$;
