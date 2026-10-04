-- TotoQuest v76: Toto trading between friends, the owner can take things back, and the Staff Panel
-- (dashboard numbers, a 30-day activity chart and a live chat between admins).

-- ---------------------------------------------------------------- gifts: takes and trade deliveries
-- take_* : the owner takes gems/candy/items/a Toto back (the game subtracts it, never below zero)
-- trade / trade_back : a Toto arriving from a finished trade, or coming home from a cancelled one
alter table private.gifts drop constraint if exists gifts_kind_check;
alter table private.gifts add constraint gifts_kind_check check (kind in
  ('gems','candy','raidPass','elixir','toto','rank1set','take_gems','take_candy','take_raidPass','take_elixir','take_toto','trade','trade_back'));

create or replace function public.admin_take(p_id uuid, p_secret text, p_target uuid, p_kind text, p_amount integer, p_toto jsonb default null, p_note text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; n integer; tj jsonb := null; gid bigint;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if p_kind not in ('gems','candy','raidPass','elixir','toto') then return json_build_object('ok', false, 'error', 'bad_kind'); end if;
  n := least(greatest(coalesce(p_amount, 1), 1), case when p_kind = 'toto' then 50 else 1000000 end);
  if p_kind = 'toto' then
    if p_toto is null or jsonb_typeof(p_toto) <> 'object' or coalesce(p_toto->>'name', '') = '' then return json_build_object('ok', false, 'error', 'bad_toto'); end if;
    tj := jsonb_build_object('name', left(p_toto->>'name', 40));
  end if;
  insert into private.gifts(player_id, kind, amount, toto, note, created_by)
    values (p_target, 'take_' || p_kind, n, tj, nullif(left(regexp_replace(trim(coalesce(p_note, '')), '[[:cntrl:]<>]', '', 'g'), 140), ''), p_id)
    returning id into gid;
  return json_build_object('ok', true, 'id', gid, 'amount', n, 'online', private.is_online(t.last_seen));
end $$;

-- ---------------------------------------------------------------- trades
-- 1. A offers one of their Totos to a friend (it leaves A's save while the trade is open)
-- 2. the friend picks one of theirs to give back (or declines)
-- 3. A accepts (both get the other's Toto) or declines (both get their own back)
-- Either trainer can cancel an open trade; every Toto that moves arrives through the gift pickup.
-- Only the species, tier, level and nature travel: the receiving game rebuilds the Toto itself.
create table if not exists private.trades (
  id         bigserial primary key,
  from_id    uuid not null references public.players(id) on delete cascade,
  to_id      uuid not null references public.players(id) on delete cascade,
  from_toto  jsonb not null,
  to_toto    jsonb,
  status     text not null default 'offered' check (status in ('offered','countered','done','declined','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_from_idx on private.trades (from_id, status);
create index if not exists trades_to_idx on private.trades (to_id, status);

-- a Toto as it travels in a trade (null = not tradeable / not valid)
create or replace function private.trade_toto(j jsonb) returns jsonb language plpgsql immutable as $$
declare nm text; tr text; lv integer := 1;
begin
  if j is null or jsonb_typeof(j) <> 'object' or pg_column_size(j) > 1500 then return null; end if;
  nm := left(trim(coalesce(j->>'name', '')), 40); tr := coalesce(j->>'tier', '');
  if nm = '' or tr not in ('normal','legendary','mythical','eternal') then return null; end if;
  -- Totos earned from achievements (the season's Rank Champions, your partner Toni) stay with their trainer
  if nm ~* '^rank #[0-9]+ champion$' or coalesce(j->>'isToni', '') = 'true' then return null; end if;
  if coalesce(j->>'level', '') ~ '^[0-9]{1,3}$' then lv := least(greatest((j->>'level')::integer, 1), 50); end if;
  return jsonb_build_object('name', nm, 'tier', tr, 'level', lv,
    'nature', left(regexp_replace(coalesce(j->>'nature', ''), '[^a-z]', '', 'g'), 12),
    'cp', case when coalesce(j->>'cp', '') ~ '^[0-9]{1,8}$' then (j->>'cp')::integer else 0 end,
    'uid', left(regexp_replace(coalesce(j->>'uid', ''), '[^A-Za-z0-9_-]', '', 'g'), 40));
end $$;

create or replace function private.trade_give(p_player uuid, p_kind text, p_toto jsonb, p_note text) returns void
language sql security definer set search_path = private as $$
  insert into private.gifts(player_id, kind, amount, toto, note) values (p_player, p_kind, 1, p_toto, left(p_note, 140));
$$;

create or replace function public.trade_offer(p_id uuid, p_secret text, p_to uuid, p_toto jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; o public.players; tj jsonb; n integer; tid bigint;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  select * into o from public.players where id = p_to and not deleted;
  if not found or p_to = p_id or not private.are_friends(p_id, p_to) or private.blocked_either(p_id, p_to) then return json_build_object('ok', false, 'error', 'not_friends'); end if;
  select count(*) into n from private.trades where (from_id = p_id or to_id = p_id) and status in ('offered','countered');
  if n >= 10 then return json_build_object('ok', false, 'error', 'too_many'); end if;
  tj := private.trade_toto(p_toto); if tj is null then return json_build_object('ok', false, 'error', 'untradeable'); end if;
  insert into private.trades(from_id, to_id, from_toto) values (p_id, p_to, tj) returning id into tid;
  return json_build_object('ok', true, 'id', tid);
end $$;

-- the friend answers: one of their Totos back (p_toto), or null to decline
create or replace function public.trade_respond(p_id uuid, p_secret text, p_trade bigint, p_toto jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; t private.trades; tj jsonb;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into t from private.trades where id = p_trade and to_id = p_id and status = 'offered' for update;
  if not found then return json_build_object('ok', false, 'error', 'gone'); end if;
  if p_toto is null then
    update private.trades set status = 'declined', updated_at = now() where id = t.id;
    perform private.trade_give(t.from_id, 'trade_back', t.from_toto, 'Your trade offer was declined');
    return json_build_object('ok', true, 'status', 'declined');
  end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  tj := private.trade_toto(p_toto); if tj is null then return json_build_object('ok', false, 'error', 'untradeable'); end if;
  update private.trades set status = 'countered', to_toto = tj, updated_at = now() where id = t.id;
  return json_build_object('ok', true, 'status', 'countered');
end $$;

-- the trainer who started it: accept the swap, or decline it
create or replace function public.trade_confirm(p_id uuid, p_secret text, p_trade bigint, p_accept boolean)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; t private.trades; fname text; tname text;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into t from private.trades where id = p_trade and from_id = p_id and status = 'countered' for update;
  if not found then return json_build_object('ok', false, 'error', 'gone'); end if;
  select name into fname from public.players where id = t.from_id; select name into tname from public.players where id = t.to_id;
  if coalesce(p_accept, false) then
    update private.trades set status = 'done', updated_at = now() where id = t.id;
    perform private.trade_give(t.from_id, 'trade', t.to_toto, 'Traded with ' || coalesce(tname, 'a friend'));
    perform private.trade_give(t.to_id, 'trade', t.from_toto, 'Traded with ' || coalesce(fname, 'a friend'));
    return json_build_object('ok', true, 'status', 'done');
  end if;
  update private.trades set status = 'declined', updated_at = now() where id = t.id;
  perform private.trade_give(t.from_id, 'trade_back', t.from_toto, 'The trade was called off');
  perform private.trade_give(t.to_id, 'trade_back', t.to_toto, 'The trade was called off');
  return json_build_object('ok', true, 'status', 'declined');
end $$;

create or replace function public.trade_cancel(p_id uuid, p_secret text, p_trade bigint)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; t private.trades;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into t from private.trades where id = p_trade and (from_id = p_id or to_id = p_id) and status in ('offered','countered') for update;
  if not found then return json_build_object('ok', false, 'error', 'gone'); end if;
  update private.trades set status = 'canceled', updated_at = now() where id = t.id;
  perform private.trade_give(t.from_id, 'trade_back', t.from_toto, 'The trade was cancelled');
  if t.to_toto is not null then perform private.trade_give(t.to_id, 'trade_back', t.to_toto, 'The trade was cancelled'); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.trades_list(p_id uuid, p_secret text)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'trades', coalesce((select json_agg(x order by x.open desc, x.updated_at desc) from (
    select t.id, t.status, t.from_toto, t.to_toto, t.created_at, t.updated_at, (t.from_id = p_id) as mine,
           o.id as other_id, o.name as other_name, o.avatar as other_avatar,
           t.status in ('offered','countered') as open,
           ((t.to_id = p_id and t.status = 'offered') or (t.from_id = p_id and t.status = 'countered')) as needs_me
      from private.trades t join public.players o on o.id = case when t.from_id = p_id then t.to_id else t.from_id end
     where (t.from_id = p_id or t.to_id = p_id)
       and (t.status in ('offered','countered') or t.updated_at > now() - interval '3 days')
     order by t.updated_at desc limit 30) x), '[]'::json));
end $$;

-- ---------------------------------------------------------------- staff panel: numbers + chart
create table if not exists private.daily_active (
  day       date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (day, player_id)
);

create or replace function public.admin_stats(p_id uuid, p_secret text)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true,
    'players',  (select count(*) from public.players where not deleted and name is not null),
    'online',   (select count(*) from public.players where not deleted and private.is_online(last_seen)),
    'active_today', (select count(*) from private.daily_active where day = current_date),
    'new_7d',   (select count(*) from public.players where not deleted and name is not null and created_at > now() - interval '7 days'),
    'new_prev7d', (select count(*) from public.players where not deleted and name is not null and created_at between now() - interval '14 days' and now() - interval '7 days'),
    'banned',   (select count(*) from public.players where not deleted and banned_until > now()),
    'reports',  (select count(*) from private.reports where resolved_at is null),
    'trades_open', (select count(*) from private.trades where status in ('offered','countered')),
    'trades_today', (select count(*) from private.trades where status = 'done' and updated_at > now() - interval '1 day'),
    'messages_today', (select count(*) from private.messages where created_at > now() - interval '1 day'),
    'matches_today', (select count(*) from private.pvp_matches where created_at > now() - interval '1 day'),
    'series', (select json_agg(json_build_object('day', d.day,
                 'active', (select count(*) from private.daily_active da where da.day = d.day),
                 'new', (select count(*) from public.players p where not p.deleted and p.name is not null and p.created_at::date = d.day)) order by d.day)
                 from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d));
end $$;

-- ---------------------------------------------------------------- staff panel: chat between admins
create table if not exists private.admin_chat (
  id         bigserial primary key,
  player_id  uuid references public.players(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create or replace function public.admin_chat_send(p_id uuid, p_secret text, p_body text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; b text := left(regexp_replace(trim(coalesce(p_body, '')), '[[:cntrl:]]', ' ', 'g'), 300);
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false, 'error', 'admin_only'); end if;
  if b = '' then return json_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from private.admin_chat where player_id = p_id and created_at > now() - interval '10 seconds') >= 5 then
    return json_build_object('ok', false, 'error', 'slow_down');
  end if;
  insert into private.admin_chat(player_id, body) values (p_id, b);
  delete from private.admin_chat where id < (select max(id) - 2000 from private.admin_chat);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_chat_poll(p_id uuid, p_secret text, p_after bigint)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'messages', coalesce((select json_agg(x order by x.id) from (
    select c.id, c.body, c.created_at, (c.player_id = p_id) as mine, coalesce(p.name, 'Admin') as name, coalesce(p.avatar, 'female') as avatar,
           coalesce(p.is_owner, false) as owner
      from private.admin_chat c left join public.players p on p.id = c.player_id
     where c.id > coalesce(p_after, 0)
     order by c.id desc limit 60) x), '[]'::json));
end $$;

-- ---------------------------------------------------------------- heartbeat: daily activity + trades waiting on you
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
  insert into private.daily_active(day, player_id) values (current_date, p_id) on conflict do nothing;
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
    'trades', (select count(*) from private.trades t where (t.to_id = p_id and t.status = 'offered') or (t.from_id = p_id and t.status = 'countered')),
    'gifts', case when b is null then (select count(*) from private.gifts g where g.player_id = p_id and g.claimed_at is null) else 0 end,
    'awards', coalesce((select json_agg(json_build_object('season', c.season, 'rank', c.rank, 'rp', c.rp) order by c.season)
                          from private.season_claims c where c.player_id = p_id and c.rank between 1 and 10 and c.season < v_season), '[]'::json));
end $$;
