-- Season awards tidy-up (decision 44): "Best partnership" now needs at least
-- half of 3+ rubbers won (a pair winning 1 of 4 isn't the best), and the
-- details use "1 fixture" / "1 rubber" rather than "1 fixtures". Otherwise unchanged.

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
                                       'detail', count(*) filter (where m.did_win) || ' of ' || count(*) || case when count(*) = 1 then ' rubber' else ' rubbers' end) as award
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
             having count(*) >= 3 and count(*) filter (where m.did_win) * 2 >= count(*)
              order by count(*) filter (where m.did_win)::numeric / count(*) desc, count(*) desc
              limit 1)
            union all
            -- Ever-present (most fixtures played)
            (select jsonb_build_object('title', 'Ever-present', 'winner', p.first_name || ' ' || p.surname,
                                       'detail', count(distinct m.fixture_id) || case when count(distinct m.fixture_id) = 1 then ' fixture played' else ' fixtures played' end) as award
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
