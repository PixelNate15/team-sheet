-- Selection balance fix: "available" now counts fixtures where the player said
-- yes OR was picked, so "picked 6 of 5 available" can't happen when a captain
-- picks someone who never replied. Otherwise unchanged.

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
         -- Available = said yes, or was picked (a captain can pick someone who hadn't replied).
         (select count(*)::int from fx
           where exists (select 1 from public.availability a where a.fixture_id = fx.id and a.user_id = p.id and a.is_available)
              or exists (select 1 from public.team_selection_players t where t.fixture_id = fx.id and t.user_id = p.id)),
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
