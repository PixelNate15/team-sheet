-- Removes everything `npm run db:seed` added: `npm run db:unseed`.
-- Your own account, club, squads, fixtures and results are left alone.
begin;

do $$
declare
  v_players uuid[] := array(select id from auth.users where email like '%@teamsheet.test');
  v_squads  bigint[];
  v_divs    bigint[];
begin
  -- The 2nd Team squad (captained by a test player) and its division, if nothing else uses it.
  select array_agg(id), array_agg(division_id) into v_squads, v_divs
    from public.squads where captain_id = any (v_players);

  -- Sample fixtures (and, through them, their results, availability and selections).
  delete from public.fixtures
   where notes like 'Sample fixture (test data)%' or squad_id = any (v_squads);

  delete from public.squads where id = any (v_squads);
  delete from public.divisions d
   where d.id = any (v_divs)
     and not exists (select 1 from public.squads s where s.division_id = d.id)
     and not exists (select 1 from public.fixtures f where f.division_id = d.id);

  -- Sample invites (batch 2 extras).
  delete from public.club_invites where email like '%@teamsheet.test';

  -- Sample league table rows (rows saved in the app always record who saved them).
  delete from public.league_table_rows where updated_by is null;

  -- The test players; their profiles, memberships, injuries and feedback go with them.
  delete from auth.users where id = any (v_players);

  raise notice 'Removed % test players and their sample data.', coalesce(array_length(v_players, 1), 0);
end;
$$;

commit;
