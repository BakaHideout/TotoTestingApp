-- TotoQuest v100: the island redesign. The game now has Gold, Food and Coins instead of candy and items.
-- Gifts keep their stored kinds (the table only allows its original kinds) and the game reads them as:
--   candy -> Food, raidPass -> Coins, elixir -> Gold.
-- So the owner can send big amounts of all three (up to 1,000,000), and Totos now level to 100.
-- Additive only: admin_gift is replaced with the same signature.
create or replace function public.admin_gift(p_id uuid, p_secret text, p_target uuid, p_kind text, p_amount integer, p_toto jsonb default null, p_note text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; n integer; tj jsonb := null; gid bigint;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if p_kind not in ('gems','candy','raidPass','elixir','toto') then return json_build_object('ok', false, 'error', 'bad_kind'); end if;
  n := coalesce(p_amount, 1);
  n := case p_kind when 'toto' then least(greatest(n, 1), 10) else least(greatest(n, 1), 1000000) end;
  if p_kind = 'toto' then
    if p_toto is null or jsonb_typeof(p_toto) <> 'object' or pg_column_size(p_toto) > 600
       or coalesce(p_toto->>'name', '') = '' or coalesce(p_toto->>'tier', '') not in ('normal','legendary','mythical','eternal') then
      return json_build_object('ok', false, 'error', 'bad_toto');
    end if;
    tj := jsonb_build_object('name', left(p_toto->>'name', 40), 'tier', p_toto->>'tier',
                             'level', least(greatest(coalesce((p_toto->>'level')::integer, 1), 1), 100));
  end if;
  insert into private.gifts(player_id, kind, amount, toto, note, created_by)
    values (p_target, p_kind, n, tj, nullif(left(regexp_replace(trim(coalesce(p_note, '')), '[[:cntrl:]<>]', '', 'g'), 140), ''), p_id)
    returning id into gid;
  return json_build_object('ok', true, 'id', gid, 'amount', n, 'online', private.is_online(t.last_seen));
end $$;

-- traded Totos keep their level (now up to 100); PvE Champions can't be traded either
create or replace function private.trade_toto(j jsonb) returns jsonb language plpgsql immutable as $$
declare nm text; tr text; lv integer := 1;
begin
  if j is null or jsonb_typeof(j) <> 'object' or pg_column_size(j) > 1500 then return null; end if;
  nm := left(trim(coalesce(j->>'name', '')), 40); tr := coalesce(j->>'tier', '');
  if nm = '' or tr not in ('normal','legendary','mythical','eternal') then return null; end if;
  if nm ~* '^(pve )?rank #[0-9]+ champion$' or coalesce(j->>'isToni', '') = 'true' then return null; end if;
  if coalesce(j->>'level', '') ~ '^[0-9]{1,3}$' then lv := least(greatest((j->>'level')::integer, 1), 100); end if;
  return jsonb_build_object('name', nm, 'tier', tr, 'level', lv,
    'nature', left(regexp_replace(coalesce(j->>'nature', ''), '[^a-z]', '', 'g'), 12),
    'cp', case when coalesce(j->>'cp', '') ~ '^[0-9]{1,8}$' then (j->>'cp')::integer else 0 end,
    'uid', left(regexp_replace(coalesce(j->>'uid', ''), '[^A-Za-z0-9_-]', '', 'g'), 40));
end $$;

-- PvP is 4 vs 4: a move names one of 4 Totos and one of 4 targets ("2:s3:1")
create or replace function public.pvp_move(p_id uuid, p_secret text, p_match uuid, p_turn integer, p_action text, p_for_opponent boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; last_turn integer; who uuid;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match for update;
  if not found or m.bot or m.status <> 'active' or p_id not in (m.p1, m.p2) then return json_build_object('ok', false); end if;
  if p_action is null or p_action !~ '^(atk|s1|s2|s3|s4|ult|auto|forfeit|pass|[0-3]:(s1|s2|s3|s4|ult):[0-3])$' then return json_build_object('ok', false); end if;
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
