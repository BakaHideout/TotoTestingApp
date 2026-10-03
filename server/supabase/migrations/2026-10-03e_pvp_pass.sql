-- TotoQuest v67: the team with the faster Toto moves first. Turns still alternate (odd = player 1),
-- so when player 2's team is faster, player 1's client sends "pass" for turn 1.

create or replace function public.pvp_move(p_id uuid, p_secret text, p_match uuid, p_turn integer, p_action text, p_for_opponent boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; last_turn integer; who uuid;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match for update;
  if not found or m.bot or m.status <> 'active' or p_id not in (m.p1, m.p2) then return json_build_object('ok', false); end if;
  if p_action is null or p_action !~ '^(atk|s1|s2|s3|s4|ult|auto|forfeit|pass|[01]:(s1|s2|s3|s4|ult):[01])$' then return json_build_object('ok', false); end if;
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
