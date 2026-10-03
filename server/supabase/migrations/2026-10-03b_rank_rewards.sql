-- TotoQuest v63: rank rewards are earned only by finishing a season at that rank, and they're
-- permanent. The finished-season results (private.season_claims) are the record: the heartbeat
-- hands the trainer's top-10 finishes back to the game on every device, so a reward survives a
-- new phone or a reinstall. The owner's testing tools no longer hand out the Rank #1 outfit.

-- the outfit can't be gifted any more (it has to be earned)
create or replace function public.admin_gift(p_id uuid, p_secret text, p_target uuid, p_kind text, p_amount integer, p_toto jsonb default null, p_note text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; n integer; tj jsonb := null; gid bigint;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if p_kind not in ('gems','candy','raidPass','elixir','toto') then return json_build_object('ok', false, 'error', 'bad_kind'); end if;
  n := coalesce(p_amount, 1);
  n := case p_kind when 'gems' then least(greatest(n, 1), 1000000) when 'candy' then least(greatest(n, 1), 1000000)
                   when 'toto' then least(greatest(n, 1), 10) else least(greatest(n, 1), 999) end;
  if p_kind = 'toto' then
    if p_toto is null or jsonb_typeof(p_toto) <> 'object' or pg_column_size(p_toto) > 600
       or coalesce(p_toto->>'name', '') = '' or coalesce(p_toto->>'tier', '') not in ('normal','legendary','mythical','eternal') then
      return json_build_object('ok', false, 'error', 'bad_toto');
    end if;
    tj := jsonb_build_object('name', left(p_toto->>'name', 40), 'tier', p_toto->>'tier',
                             'level', least(greatest(coalesce((p_toto->>'level')::integer, 1), 1), 50));
  end if;
  insert into private.gifts(player_id, kind, amount, toto, note, created_by)
    values (p_target, p_kind, n, tj, nullif(left(regexp_replace(trim(coalesce(p_note, '')), '[[:cntrl:]<>]', '', 'g'), 140), ''), p_id)
    returning id into gid;
  return json_build_object('ok', true, 'id', gid, 'amount', n, 'online', private.is_online(t.last_seen));
end $$;
-- any outfit gift still waiting is withdrawn
update private.gifts set claimed_at = now(), note = coalesce(note, '') || ' [withdrawn: rank rewards are earned at season end]'
 where kind = 'rank1set' and claimed_at is null;

-- testing: set Rank Points (or jump to #1) without any reward — rewards come when the season ends
create or replace function public.admin_set_rp(p_id uuid, p_secret text, p_target uuid, p_rp integer, p_make_top boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; v_season text := private.season_now(); top integer; newrp integer;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.season_row(p_target);
  if coalesce(p_make_top, false) then
    select coalesce(max(rp), 0) into top from private.season_scores where season = v_season and player_id <> p_target and not hidden;
    newrp := greatest(1600, top + 50);
  else
    newrp := least(greatest(coalesce(p_rp, 0), 0), 100000);
  end if;
  update private.season_scores set rp = newrp, wins = case when wins + losses = 0 then 1 else wins end, updated_at = now()
   where season = v_season and player_id = p_target;
  return json_build_object('ok', true, 'rp', newrp, 'place', private.pvp_place(v_season, newrp));
end $$;

-- heartbeat: also returns the trainer's finished-season top-10 places ("awards")
create or replace function public.heartbeat(p_id uuid, p_secret text, p_name text, p_avatar text, p_level integer, p_power integer, p_totos integer, p_look jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; b json; s private.season_scores; v_season text := private.season_now();
begin
  select * into r from public.players where id = p_id;
  if not found then return json_build_object('ok', false); end if;
  if r.deleted or r.secret_hash = 'removed' then return json_build_object('ok', false, 'deleted', true); end if;
  if r.secret_hash <> extensions.crypt(p_secret, r.secret_hash) then return json_build_object('ok', false); end if;
  update public.players set name = private.clean_name(p_name), avatar = case when p_avatar = 'male' then 'male' else 'female' end,
     level = greatest(1, least(coalesce(p_level,1), 100)), power = greatest(0, least(coalesce(p_power,0), 50000000)),
     look = case when p_look is null or pg_column_size(p_look) > 2000 then look else p_look end,
     last_seen = now(), last_ip = coalesce(private.client_ip(), last_ip)
   where id = p_id returning * into r;
  b := private.ban_info(r);
  perform private.pvp_settle_stale();
  if b is null then
    perform private.season_row(p_id);
    update private.season_scores set name = r.name, avatar = r.avatar, look = r.look, power = r.power, level = r.level,
       totos = greatest(0, least(coalesce(p_totos, totos), 100000)), updated_at = now()
     where private.season_scores.season = v_season and player_id = p_id;
  end if;
  select * into s from private.season_scores ss where ss.season = v_season and ss.player_id = p_id;
  return json_build_object('ok', true, 'now', now(), 'season', v_season, 'ban', b, 'admin', r.is_admin, 'owner', r.is_owner,
    'rp', coalesce(s.rp, 0), 'wins', coalesce(s.wins, 0), 'losses', coalesce(s.losses, 0), 'place', private.pvp_place(v_season, s.rp),
    'unread', (select count(*) from private.messages m where m.to_id = p_id and m.read_at is null and not private.blocked_either(m.from_id, p_id)),
    'requests', (select count(*) from private.friends f where f.to_id = p_id and f.status = 'pending' and f.active and not private.blocked_either(f.from_id, p_id)),
    'gifts', case when b is null then (select count(*) from private.gifts g where g.player_id = p_id and g.claimed_at is null) else 0 end,
    'awards', coalesce((select json_agg(json_build_object('season', c.season, 'rank', c.rank, 'rp', c.rp) order by c.season)
                          from private.season_claims c where c.player_id = p_id and c.rank between 1 and 10 and c.season < v_season), '[]'::json));
end $$;
