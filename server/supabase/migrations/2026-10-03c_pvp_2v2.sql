-- TotoQuest v64: PvP is 2 vs 2. A trainer's lobby entry now carries a team (a JSON array of 2
-- Toto snapshots); trainers are only paired with others on the same version (team vs team, or
-- the old single Toto vs single Toto). Moves name which Toto acts and its target: "<who>:<skill>:<target>".

create or replace function public.pvp_move(p_id uuid, p_secret text, p_match uuid, p_turn integer, p_action text, p_for_opponent boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; last_turn integer; who uuid;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match for update;
  if not found or m.bot or m.status <> 'active' or p_id not in (m.p1, m.p2) then return json_build_object('ok', false); end if;
  if p_action is null or p_action !~ '^(atk|s1|s2|s3|s4|ult|auto|forfeit|[01]:(s1|s2|s3|s4|ult):[01])$' then return json_build_object('ok', false); end if;
  select coalesce(max(turn), 0) into last_turn from private.pvp_moves where match_id = p_match;
  if p_turn <> last_turn + 1 then return json_build_object('ok', false, 'turn', last_turn); end if;
  who := p_id;
  if p_for_opponent then
    if m.last_move_at > now() - interval '25 seconds' then return json_build_object('ok', false, 'early', true); end if;
    who := case when p_id = m.p1 then m.p2 else m.p1 end;
    p_action := 'auto';
  end if;
  -- turns alternate: odd turns belong to p1, even turns to p2
  if p_action <> 'forfeit' and (p_turn % 2 = 1) <> (who = m.p1) then return json_build_object('ok', false, 'not_your_turn', true, 'turn', last_turn); end if;
  insert into private.pvp_moves(match_id, turn, player_id, action) values (p_match, p_turn, who, p_action);
  update private.pvp_matches set last_move_at = now() where id = p_match;
  update private.pvp_lobby set status = 'battling' where player_id = p_id and match_id = p_match;
  return json_build_object('ok', true, 'turn', p_turn);
end $$;

create or replace function public.pvp_lobby_poll(p_id uuid, p_secret text, p_status text, p_toto jsonb, p_look jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; me private.pvp_lobby; opp private.pvp_lobby; m private.pvp_matches; s private.season_scores; v_season text := private.season_now();
begin
  r := private.me(p_id, p_secret);
  if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'banned', true); end if;
  if p_status = 'leave' then update private.pvp_lobby set status = 'idle', match_id = null, updated_at = '-infinity' where player_id = p_id; return json_build_object('ok', true); end if;
  if p_toto is not null and pg_column_size(p_toto) > 3000 then p_toto := null; end if;
  s := private.season_row(p_id);
  insert into private.pvp_lobby(player_id, name, avatar, look, toto, rp, status, searching_since, updated_at)
  values (p_id, r.name, r.avatar, coalesce(p_look, r.look), p_toto, s.rp, case when p_status = 'searching' then 'searching' else 'idle' end,
          case when p_status = 'searching' then now() end, now())
  on conflict (player_id) do update set name = excluded.name, avatar = excluded.avatar, look = excluded.look,
     toto = coalesce(excluded.toto, private.pvp_lobby.toto), rp = excluded.rp, updated_at = now(),
     status = case when private.pvp_lobby.status in ('matched','battling') then private.pvp_lobby.status else excluded.status end,
     searching_since = case when excluded.status = 'searching' then coalesce(private.pvp_lobby.searching_since, now()) else null end;
  select * into me from private.pvp_lobby where player_id = p_id;
  if me.match_id is not null then
    select * into m from private.pvp_matches where id = me.match_id;
    if not found or m.status <> 'active' or m.created_at < now() - interval '15 minutes' then
      update private.pvp_lobby set status = case when p_status = 'searching' then 'searching' else 'idle' end, match_id = null where player_id = p_id;
      me.match_id := null; m := null;
    end if;
  end if;
  -- matchmaking: the closest-ranked trainer who is also searching, with the same kind of team
  if me.match_id is null and p_status = 'searching' and p_toto is not null then
    select * into opp from private.pvp_lobby o
     where o.player_id <> p_id and o.status = 'searching' and o.match_id is null and o.updated_at > now() - interval '8 seconds' and o.toto is not null
       and jsonb_typeof(o.toto) = jsonb_typeof(p_toto)
       and not private.blocked_either(o.player_id, p_id)
     order by abs(o.rp - me.rp), o.searching_since limit 1 for update skip locked;
    if found then
      insert into private.pvp_matches(season, p1, p2, bot, seed, p1_name, p2_name, p1_look, p2_look, p1_toto, p2_toto, p1_rp, p2_rp)
      values (v_season, opp.player_id, p_id, false, floor(random()*2147483646)::int + 1, opp.name, me.name, opp.look, me.look, opp.toto, me.toto, opp.rp, me.rp)
      returning * into m;
      update private.pvp_lobby set status = 'matched', match_id = m.id, searching_since = null where player_id in (p_id, opp.player_id);
      me.match_id := m.id;
    end if;
  end if;
  if me.match_id is not null and m.id is null then select * into m from private.pvp_matches where id = me.match_id; end if;
  return json_build_object('ok', true, 'now', now(), 'season', v_season, 'rp', s.rp, 'wins', s.wins, 'losses', s.losses,
    'place', private.pvp_place(v_season, s.rp),
    'players', coalesce((select json_agg(json_build_object('id', l.player_id, 'name', l.name, 'avatar', l.avatar, 'look', l.look, 'toto', l.toto, 'rp', l.rp, 'place', private.pvp_place(v_season, l.rp), 'status', l.status,
                          'friend', private.are_friends(l.player_id, p_id)) order by l.updated_at desc)
                         from (select * from private.pvp_lobby where updated_at > now() - interval '15 seconds' and player_id <> p_id
                                 and not private.blocked_either(player_id, p_id) order by updated_at desc limit 40) l), '[]'::json),
    'match', case when m.id is null then null else json_build_object('id', m.id, 'seed', m.seed, 'bot', m.bot, 'p1', m.p1, 'p2', m.p2,
       'p1_name', m.p1_name, 'p2_name', m.p2_name, 'p1_look', m.p1_look, 'p2_look', m.p2_look, 'p1_toto', m.p1_toto, 'p2_toto', m.p2_toto,
       'p1_rp', m.p1_rp, 'p2_rp', m.p2_rp, 'p1_place', private.pvp_place(m.season, m.p1_rp), 'p2_place', private.pvp_place(m.season, m.p2_rp), 'created_at', m.created_at) end);
end $$;
