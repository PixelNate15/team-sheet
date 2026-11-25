-- Results follow the same rule as team selection (decision 31): only the
-- team's own players, or players borrowed for that fixture, can be entered,
-- so the twice-a-season playing-up limit can't be side-stepped through results.
-- save_fixture_result is otherwise unchanged.

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
    -- Only the team's own players or players borrowed for this fixture (playing-up limit).
    if exists (
      select 1 from unnest(array[v_row.player_1, v_row.player_2]) as u(id)
       where not exists (select 1 from public.squad_players sp where sp.user_id = u.id and sp.squad_id = v_fixture.squad_id)
         and not exists (select 1 from public.fixture_borrowed_players b where b.user_id = u.id and b.fixture_id = p_fixture)
    ) then
      raise exception 'Rubber %: only players in this team, or borrowed for this fixture, can be entered', v_row.rubber_number;
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
