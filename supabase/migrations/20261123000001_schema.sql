-- =====================================================================
-- Sport Team Management: core schema
-- Postgres port of Original_Code/Sports_Team_Management_db_handover,
-- extended for multiple clubs and Supabase Auth.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profiles (replaces `user`). Credentials live in auth.users; the old
-- username / password_hash / bcrypt flow is replaced by Supabase Auth.
-- Date of birth was only used to generate usernames, so it is no longer
-- collected (data minimisation).
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  first_name            text not null check (char_length(btrim(first_name)) between 1 and 50),
  surname               text not null check (char_length(btrim(surname)) between 1 and 50),
  theme                 text not null default 'system' check (theme in ('system', 'light', 'dark')),
  expo_push_token       text,
  notifications_enabled boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, surname)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'New'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'surname'), ''), 'Player')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Clubs and membership (multi-club). A user belongs to at most one club.
-- ---------------------------------------------------------------------
create table public.clubs (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 2 and 100),
  join_code  text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id   bigint not null references public.clubs (id) on delete cascade,
  user_id   uuid not null unique references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.divisions (
  id         bigint generated always as identity primary key,
  club_id    bigint not null references public.clubs (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  team_count int not null check (team_count between 2 and 40)
);

-- Seasons are per club (the original `season.is_current` was global).
create table public.seasons (
  id         bigint generated always as identity primary key,
  club_id    bigint not null references public.clubs (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  is_current boolean not null default false
);
create unique index seasons_one_current_per_club on public.seasons (club_id) where is_current;

-- ranking: 1 = first team, 2 = second team, ...
create table public.squads (
  id          bigint generated always as identity primary key,
  club_id     bigint not null references public.clubs (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 50),
  ranking     int not null check (ranking >= 1),
  division_id bigint references public.divisions (id) on delete set null,
  captain_id  uuid references public.profiles (id) on delete set null,
  unique (club_id, ranking)
);

-- A player is in at most one squad (and, via club_members, one club).
create table public.squad_players (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  squad_id bigint not null references public.squads (id) on delete cascade
);
create index squad_players_squad_idx on public.squad_players (squad_id);

-- ---------------------------------------------------------------------
-- Fixtures, availability, team selection
-- ---------------------------------------------------------------------
create table public.fixtures (
  id                       bigint generated always as identity primary key,
  club_id                  bigint not null references public.clubs (id) on delete cascade,
  squad_id                 bigint not null references public.squads (id) on delete cascade,
  season_id                bigint references public.seasons (id) on delete set null,
  division_id              bigint references public.divisions (id) on delete set null,
  created_by               uuid references public.profiles (id) on delete set null,
  opponent_name            text not null check (char_length(btrim(opponent_name)) between 1 and 100),
  fixture_date             date not null,
  start_time               time not null,
  location                 text not null check (char_length(btrim(location)) between 1 and 200),
  is_home                  boolean not null,
  opponent_league_position int check (opponent_league_position >= 1),
  notes                    text check (char_length(notes) <= 1000),
  team_selected_at         timestamptz,
  created_at               timestamptz not null default now()
);
create index fixtures_squad_date_idx on public.fixtures (squad_id, fixture_date);
create index fixtures_club_idx on public.fixtures (club_id);

create table public.availability (
  fixture_id   bigint not null references public.fixtures (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  is_available boolean not null,
  reason       text check (char_length(reason) <= 500),
  submitted_at timestamptz not null default now(),
  primary key (fixture_id, user_id)
);

-- Merges the old team_selection + team_selection_players tables.
create table public.team_selection_players (
  fixture_id      bigint not null references public.fixtures (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  pair_number     int not null check (pair_number in (1, 2)),
  selection_order int not null check (selection_order in (1, 2)),
  primary key (fixture_id, user_id),
  unique (fixture_id, pair_number, selection_order)
);

-- ---------------------------------------------------------------------
-- Injuries: history is kept; at most one current injury per player.
-- ---------------------------------------------------------------------
create table public.injuries (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  description       text not null check (char_length(btrim(description)) between 1 and 200),
  start_date        date not null default current_date,
  expected_end_date date not null,
  is_current        boolean not null default true,
  can_play          boolean not null default false,
  notes             text check (char_length(notes) <= 1000),
  ended_on          date
);
create unique index injuries_one_current_per_user on public.injuries (user_id) where is_current;

-- ---------------------------------------------------------------------
-- Results. A fixture has 4 rubbers: pairs [1,2,1,2] vs opponent pairs [1,2,2,1].
-- ---------------------------------------------------------------------
create table public.matches (
  id                   bigint generated always as identity primary key,
  fixture_id           bigint not null references public.fixtures (id) on delete cascade,
  rubber_number        int not null check (rubber_number between 1 and 4),
  pair_number          int not null check (pair_number in (1, 2)),
  opponent_pair_number int not null check (opponent_pair_number in (1, 2)),
  match_date           date not null,
  did_win              boolean not null,
  sets_won             int not null check (sets_won between 0 and 2),
  sets_lost            int not null check (sets_lost between 0 and 2),
  games_won            int not null check (games_won >= 0),
  games_lost           int not null check (games_lost >= 0),
  set_1_won            int not null check (set_1_won between 0 and 7),
  set_1_lost           int not null check (set_1_lost between 0 and 7),
  set_2_won            int not null check (set_2_won between 0 and 7),
  set_2_lost           int not null check (set_2_lost between 0 and 7),
  champ_tie            char(1) check (champ_tie in ('W', 'L')),
  unique (fixture_id, rubber_number)
);
create index matches_date_idx on public.matches (match_date);

create table public.match_players (
  match_id              bigint not null references public.matches (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  partner_user_id       uuid not null references public.profiles (id) on delete cascade,
  partner_form_at_match numeric(6, 3),
  primary key (match_id, user_id)
);
create index match_players_user_idx on public.match_players (user_id);
create index match_players_partner_idx on public.match_players (user_id, partner_user_id);

create table public.partner_feedback (
  id                   bigint generated always as identity primary key,
  match_id             bigint not null references public.matches (id) on delete cascade,
  reviewer_id          uuid not null references public.profiles (id) on delete cascade,
  reviewed_id          uuid not null references public.profiles (id) on delete cascade,
  overall_rating       int not null check (overall_rating between 0 and 10),
  key_moments_rating   int not null check (key_moments_rating between 0 and 10),
  communication_rating int not null check (communication_rating between 0 and 10),
  comments             text check (char_length(comments) <= 1000),
  created_at           timestamptz not null default now(),
  unique (match_id, reviewer_id),
  check (reviewer_id <> reviewed_id)
);
create index partner_feedback_reviewed_idx on public.partner_feedback (reviewed_id, created_at desc);

-- =====================================================================
-- Helper functions for Row Level Security (security definer avoids
-- recursive policy evaluation on club_members).
-- =====================================================================
create or replace function public.my_club_id()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select club_id from public.club_members where user_id = auth.uid()
$$;

create or replace function public.is_club_admin(p_club bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_members
    where user_id = auth.uid() and club_id = p_club and role = 'admin'
  )
$$;

-- Captain of the squad, or an admin of its club.
create or replace function public.can_manage_squad(p_squad bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.squads s
    where s.id = p_squad
      and (s.captain_id = auth.uid() or public.is_club_admin(s.club_id))
  )
$$;

create or replace function public.fixture_club(p_fixture bigint)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select club_id from public.fixtures where id = p_fixture
$$;

create or replace function public.fixture_squad(p_fixture bigint)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select squad_id from public.fixtures where id = p_fixture
$$;

create or replace function public.match_fixture(p_match bigint)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select fixture_id from public.matches where id = p_match
$$;

-- Can the current user manage the squad this player is in?
create or replace function public.can_manage_player(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.squad_players sp
    where sp.user_id = p_user and public.can_manage_squad(sp.squad_id)
  ) or exists (
    select 1 from public.club_members cm
    where cm.user_id = p_user and public.is_club_admin(cm.club_id)
  )
$$;

create or replace function public.same_club(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.club_members cm
    where cm.user_id = p_user and cm.club_id = public.my_club_id()
  )
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles               enable row level security;
alter table public.clubs                  enable row level security;
alter table public.club_members           enable row level security;
alter table public.divisions              enable row level security;
alter table public.seasons                enable row level security;
alter table public.squads                 enable row level security;
alter table public.squad_players          enable row level security;
alter table public.fixtures               enable row level security;
alter table public.availability           enable row level security;
alter table public.team_selection_players enable row level security;
alter table public.injuries               enable row level security;
alter table public.matches                enable row level security;
alter table public.match_players          enable row level security;
alter table public.partner_feedback       enable row level security;

-- profiles: see yourself and your club; edit only yourself.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.same_club(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- clubs: members read; admins rename. Creation/joining go through RPCs.
create policy clubs_select on public.clubs for select to authenticated
  using (id = public.my_club_id());
create policy clubs_update on public.clubs for update to authenticated
  using (public.is_club_admin(id)) with check (public.is_club_admin(id));

-- club_members: read own club; admins change roles / remove; anyone may leave.
create policy club_members_select on public.club_members for select to authenticated
  using (club_id = public.my_club_id());
create policy club_members_update on public.club_members for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
create policy club_members_delete on public.club_members for delete to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id));

-- divisions / seasons / squads: read own club; admins write.
create policy divisions_select on public.divisions for select to authenticated
  using (club_id = public.my_club_id());
create policy divisions_write on public.divisions for all to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy seasons_select on public.seasons for select to authenticated
  using (club_id = public.my_club_id());
create policy seasons_write on public.seasons for all to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy squads_select on public.squads for select to authenticated
  using (club_id = public.my_club_id());
create policy squads_write on public.squads for all to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

-- squad_players: read own club; admins write directly (captains use RPCs).
create policy squad_players_select on public.squad_players for select to authenticated
  using (public.same_club(user_id));
create policy squad_players_write on public.squad_players for all to authenticated
  using (public.can_manage_squad(squad_id) and public.same_club(user_id))
  with check (public.is_club_admin(public.my_club_id()) and public.same_club(user_id));

-- fixtures: read own club; captain of the squad (or admin) writes.
create policy fixtures_select on public.fixtures for select to authenticated
  using (club_id = public.my_club_id());
create policy fixtures_insert on public.fixtures for insert to authenticated
  with check (club_id = public.my_club_id() and public.can_manage_squad(squad_id));
create policy fixtures_update on public.fixtures for update to authenticated
  using (public.can_manage_squad(squad_id))
  with check (club_id = public.my_club_id() and public.can_manage_squad(squad_id));
create policy fixtures_delete on public.fixtures for delete to authenticated
  using (public.can_manage_squad(squad_id));

-- availability: read own club; players write only their own rows for their squad's fixtures.
create policy availability_select on public.availability for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
create policy availability_write on public.availability for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.squad_players sp
      where sp.user_id = auth.uid() and sp.squad_id = public.fixture_squad(fixture_id)
    )
  );

-- team selection: read own club; captain writes (normally via save_fixture RPC).
create policy tsp_select on public.team_selection_players for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
create policy tsp_write on public.team_selection_players for all to authenticated
  using (public.can_manage_squad(public.fixture_squad(fixture_id)))
  with check (public.can_manage_squad(public.fixture_squad(fixture_id)) and public.same_club(user_id));

-- injuries: club can read (captains need it for selection); players write their own.
create policy injuries_select on public.injuries for select to authenticated
  using (user_id = auth.uid() or public.same_club(user_id));
create policy injuries_write on public.injuries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- matches / match_players: read own club; written only via save_fixture_result RPC.
create policy matches_select on public.matches for select to authenticated
  using (public.fixture_club(fixture_id) = public.my_club_id());
create policy matches_write on public.matches for all to authenticated
  using (public.can_manage_squad(public.fixture_squad(fixture_id)))
  with check (public.can_manage_squad(public.fixture_squad(fixture_id)));

create policy match_players_select on public.match_players for select to authenticated
  using (public.fixture_club(public.match_fixture(match_id)) = public.my_club_id());
create policy match_players_write on public.match_players for all to authenticated
  using (public.can_manage_squad(public.fixture_squad(public.match_fixture(match_id))))
  with check (public.can_manage_squad(public.fixture_squad(public.match_fixture(match_id))));

-- partner feedback: private between the two partners, plus whoever manages the reviewed player.
create policy feedback_select on public.partner_feedback for select to authenticated
  using (reviewer_id = auth.uid() or reviewed_id = auth.uid() or public.can_manage_player(reviewed_id));
create policy feedback_insert on public.partner_feedback for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.match_players mp
      where mp.match_id = partner_feedback.match_id
        and mp.user_id = auth.uid()
        and mp.partner_user_id = partner_feedback.reviewed_id
    )
  );
