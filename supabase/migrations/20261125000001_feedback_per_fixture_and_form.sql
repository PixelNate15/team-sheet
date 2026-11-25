-- 1. Partner feedback: one rating per partner per fixture (was one per rubber).
-- 2. Form score: partner and opponent strength become adjustments centred on 1,
--    so scores no longer drift towards zero.
-- See "Team Sheet - Algorithms" and decisions 29-30 in the project notes.

-- ---------------------------------------------------------------------
-- 1. Feedback per fixture
-- ---------------------------------------------------------------------
-- Pairs play two rubbers together in a fixture, so players were asked to rate
-- the same partner twice. Keep the rating on the earliest rubber and drop the
-- repeat; the rating stays attached to a match, so nothing else changes shape.
delete from public.partner_feedback pf
 using public.matches m
 where m.id = pf.match_id
   and exists (
     select 1
       from public.partner_feedback pf2
       join public.matches m2 on m2.id = pf2.match_id
      where m2.fixture_id = m.fixture_id
        and pf2.reviewer_id = pf.reviewer_id
        and pf2.reviewed_id = pf.reviewed_id
        and (m2.rubber_number, pf2.id) < (m.rubber_number, pf.id));

-- Refuse a second rating of the same partner for the same fixture.
create or replace function public.feedback_once_per_fixture()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.partner_feedback pf
      join public.matches m on m.id = pf.match_id
     where m.fixture_id = (select fixture_id from public.matches where id = new.match_id)
       and pf.reviewer_id = new.reviewer_id
       and pf.reviewed_id = new.reviewed_id
  ) then
    raise exception 'You''ve already rated this partner for this fixture' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke execute on function public.feedback_once_per_fixture() from public, anon, authenticated;

create trigger partner_feedback_once_per_fixture
  before insert on public.partner_feedback
  for each row execute function public.feedback_once_per_fixture();

-- my_results: "feedback given" now means for that partner in that fixture.
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
    exists (
      select 1
        from public.partner_feedback pf
        join public.matches x on x.id = pf.match_id
       where x.fixture_id = f.id
         and pf.reviewer_id = auth.uid()
         and pf.reviewed_id = mp.partner_user_id),
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
-- 2. Form score
-- ---------------------------------------------------------------------
--   match_score = games_ratio * opponent_factor * partner_factor
--   form        = sum(match_score * recency) / sum(recency)
--   recency     = 0.5 ^ (days_since_match / 60)             (unchanged)
--   opponent    = 1 + 0.4 * ((teams + 1) / 2 - position) / (teams - 1), within 0.8-1.2:
--                 a mid-table opponent is neutral; top 1.2, bottom 0.8, whatever
--                 the division size. Still only once the squad has >= 2 resulted
--                 fixtures that season, else 1.0.
--   partner     = 1 + 0.4 * (partner's form at the match - 0.5), within 0.8-1.2:
--                 an average partner (0.5) is neutral, a stronger one counts a
--                 little more, a weaker one a little less; unknown = 1.0.
-- Both adjustments are centred on 1, so a player who wins half their games
-- against average opposition with average partners scores about 0.5, and
-- scores no longer shrink because partners' scores feed into each other.
--
-- form_score_raw has no permission check; it's internal (used below to rebuild
-- history). form_score keeps the club-only check for the app.
create or replace function public.form_score_raw(p_user uuid, p_at date default current_date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  with history as (
    select
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
        then least(1.2, greatest(0.8,
               1 + 0.4 * ((d.team_count + 1) / 2.0 - f.opponent_league_position) / (d.team_count - 1)))
        else 1.0
      end                                                                         as opponent_factor,
      case when mp.partner_form_at_match is null then 1.0
           else least(1.2, greatest(0.8, 1 + 0.4 * (mp.partner_form_at_match - 0.5))) end
                                                                                  as partner_factor,
      power(0.5::numeric, (p_at - m.match_date)::numeric / 60)                   as recency
    from public.match_players mp
    join public.matches m   on m.id = mp.match_id
    join public.fixtures f  on f.id = m.fixture_id
    left join public.divisions d on d.id = f.division_id
    where mp.user_id = p_user
      and m.match_date >= (current_date - interval '3 years')::date
      and m.match_date < p_at
  )
  select case when sum(recency) is null or sum(recency) = 0 then null
              else round(sum(games_ratio * opponent_factor * partner_factor * recency) / sum(recency), 4)
         end
  from history
$$;
revoke execute on function public.form_score_raw(uuid, date) from public, anon, authenticated;

create or replace function public.form_score(p_user uuid, p_at date default current_date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when p_user = auth.uid() or public.same_club(p_user)
              then public.form_score_raw(p_user, p_at) end
$$;

-- Rebuild each rubber's "partner's form at the time" with the new formula,
-- oldest first, so every value only depends on rubbers already rebuilt.
do $$
declare
  v_day date;
begin
  for v_day in select distinct match_date from public.matches order by 1 loop
    update public.match_players mp
       set partner_form_at_match = public.form_score_raw(mp.partner_user_id, v_day)
      from public.matches m
     where m.id = mp.match_id
       and m.match_date = v_day;
  end loop;
end;
$$;
