-- TotoQuest v62: the owner can send gifts (gems, candy, Raid Passes, Healing Elixirs, a Toto, the
-- Rank #1 outfit) to any trainer, and set a trainer's season Rank Points (for testing ranks).
-- A gift waits in private.gifts until the trainer's game picks it up on its next heartbeat; the
-- game adds it to the save, then acknowledges it so it's never handed out twice.

create table if not exists private.gifts (
  id         bigserial primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  kind       text not null check (kind in ('gems','candy','raidPass','elixir','toto','rank1set')),
  amount     integer not null default 1 check (amount between 1 and 1000000),
  toto       jsonb,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists gifts_open_idx on private.gifts (player_id) where claimed_at is null;

-- ---------------------------------------------------------------- owner: send a gift
-- p_toto (kind 'toto'): {"name": species name, "tier": normal|legendary|mythical|eternal, "level": 1-50}
create or replace function public.admin_gift(p_id uuid, p_secret text, p_target uuid, p_kind text, p_amount integer, p_toto jsonb default null, p_note text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; n integer; tj jsonb := null; gid bigint;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if p_kind not in ('gems','candy','raidPass','elixir','toto','rank1set') then return json_build_object('ok', false, 'error', 'bad_kind'); end if;
  n := coalesce(p_amount, 1);
  n := case p_kind when 'gems' then least(greatest(n, 1), 1000000) when 'candy' then least(greatest(n, 1), 1000000)
                   when 'toto' then least(greatest(n, 1), 10) when 'rank1set' then 1 else least(greatest(n, 1), 999) end;
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

-- ---------------------------------------------------------------- owner: set season Rank Points (testing)
-- p_make_top: put them at #1 of this season's PvP board (above everyone, at least Master) and send
-- them the Rank #1 outfit; otherwise RP is set to p_rp.
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
  if coalesce(p_make_top, false) and not exists (select 1 from private.gifts g where g.player_id = p_target and g.kind = 'rank1set' and g.claimed_at is null) then
    insert into private.gifts(player_id, kind, amount, note, created_by) values (p_target, 'rank1set', 1, 'Rank #1 this season', p_id);
  end if;
  return json_build_object('ok', true, 'rp', newrp, 'place', private.pvp_place(v_season, newrp));
end $$;

-- ---------------------------------------------------------------- trainer: pick up gifts
create or replace function public.gifts_pending(p_id uuid, p_secret text)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'gifts', coalesce((select json_agg(x order by x.id) from (
    select g.id, g.kind, g.amount, g.toto, g.note, g.created_at from private.gifts g
     where g.player_id = p_id and g.claimed_at is null order by g.id limit 50) x), '[]'::json));
end $$;
create or replace function public.gifts_ack(p_id uuid, p_secret text, p_ids bigint[])
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; n integer;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  update private.gifts set claimed_at = now() where player_id = p_id and claimed_at is null and id = any(coalesce(p_ids, '{}'::bigint[]));
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'claimed', n);
end $$;

-- ---------------------------------------------------------------- heartbeat: now also says how many gifts are waiting
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
    'gifts', case when b is null then (select count(*) from private.gifts g where g.player_id = p_id and g.claimed_at is null) else 0 end);
end $$;
