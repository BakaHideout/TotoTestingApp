-- TotoQuest v56 backend: accounts on the server (online status, bans, admins), friends + messages,
-- monthly seasons (PvE power + PvP Rank Points) and PvP matchmaking / turn sync.
-- Everything new lives in the `private` schema (not exposed by the API). The game only talks to
-- it through the security-definer functions below, each of which checks the trainer's secret.

-- ---------------------------------------------------------------- players: profile + status
alter table public.players add column if not exists name        text;
alter table public.players add column if not exists avatar      text not null default 'female';
alter table public.players add column if not exists level       integer not null default 1;
alter table public.players add column if not exists power       integer not null default 0;
alter table public.players add column if not exists look        jsonb;
alter table public.players add column if not exists last_seen   timestamptz;
alter table public.players add column if not exists last_ip     text;
alter table public.players add column if not exists is_admin    boolean not null default false;
alter table public.players add column if not exists is_owner    boolean not null default false;
alter table public.players add column if not exists deleted     boolean not null default false;
alter table public.players add column if not exists banned_until timestamptz;
alter table public.players add column if not exists ban_reason  text;
create index if not exists players_name_lc_idx on public.players (lower(name));
create index if not exists players_last_seen_idx on public.players (last_seen desc);
-- names the leaderboard already knows
update public.players p set name = l.name, avatar = l.avatar, level = l.level, power = l.power
  from public.leaderboard l where l.player_id = p.id and p.name is null and not l.hidden;
update public.players p set deleted = true where secret_hash = 'removed';

create table if not exists private.ip_bans (
  ip         text primary key,
  until      timestamptz,                 -- null = permanent
  reason     text,
  player_id  uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- friends + messages
create table if not exists private.friends (
  from_id    uuid not null references public.players(id) on delete cascade,
  to_id      uuid not null references public.players(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create index if not exists friends_to_idx on private.friends (to_id);
alter table private.friends add column if not exists active boolean not null default true;   -- false = removed / declined
create table if not exists private.blocks (
  blocker uuid not null references public.players(id) on delete cascade,
  blocked uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table private.blocks add column if not exists active boolean not null default true;    -- false = unblocked
create table if not exists private.messages (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references public.players(id) on delete cascade,
  to_id      uuid not null references public.players(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_pair_idx on private.messages (least(from_id,to_id), greatest(from_id,to_id), id desc);
create index if not exists messages_unread_idx on private.messages (to_id) where read_at is null;
create table if not exists private.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null,
  reported    uuid not null,
  message_id  bigint,
  body        text,
  reason      text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- seasons + PvP
create table if not exists private.season_scores (
  season     text not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  name       text not null,
  avatar     text not null default 'female',
  look       jsonb,
  power      integer not null default 0,
  level      integer not null default 1,
  totos      integer not null default 0,
  rp         integer not null default 0,
  wins       integer not null default 0,
  losses     integer not null default 0,
  bot_rp_day date,
  bot_rp     integer not null default 0,
  hidden     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (season, player_id)
);
create index if not exists season_power_idx on private.season_scores (season, power desc);
create index if not exists season_rp_idx on private.season_scores (season, rp desc, wins desc);
create table if not exists private.season_claims (
  season    text not null,
  player_id uuid not null,
  rank      integer,
  rp        integer,
  claimed_at timestamptz not null default now(),
  primary key (season, player_id)
);
create table if not exists private.pvp_lobby (
  player_id  uuid primary key references public.players(id) on delete cascade,
  name       text not null,
  avatar     text not null default 'female',
  look       jsonb,
  toto       jsonb,
  rp         integer not null default 0,
  status     text not null default 'idle' check (status in ('idle','searching','matched','battling')),
  match_id   uuid,
  searching_since timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists private.pvp_matches (
  id         uuid primary key default gen_random_uuid(),
  season     text not null,
  p1         uuid not null,
  p2         uuid,                       -- null = computer opponent
  bot        boolean not null default false,
  seed       integer not null,
  p1_name text, p2_name text, p1_look jsonb, p2_look jsonb, p1_toto jsonb, p2_toto jsonb, p1_rp integer, p2_rp integer,
  status     text not null default 'active' check (status in ('active','done','disputed','abandoned')),
  p1_result  text check (p1_result in ('win','loss')),
  p2_result  text check (p2_result in ('win','loss')),
  winner     uuid,
  p1_delta   integer, p2_delta integer,
  created_at timestamptz not null default now(),
  last_move_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists pvp_matches_p1_idx on private.pvp_matches (p1, created_at desc);
create index if not exists pvp_matches_p2_idx on private.pvp_matches (p2, created_at desc);
create index if not exists pvp_matches_open_idx on private.pvp_matches (created_at) where status = 'active';
create table if not exists private.pvp_moves (
  match_id   uuid not null references private.pvp_matches(id) on delete cascade,
  turn       integer not null,
  player_id  uuid not null,
  action     text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, turn)
);

-- ---------------------------------------------------------------- helpers
create or replace function private.season_now() returns text language sql stable as $$
  select to_char(now() at time zone 'America/Detroit', 'YYYY-MM')
$$;
create or replace function private.client_ip() returns text language plpgsql stable as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := coalesce(nullif(h->>'cf-connecting-ip',''), nullif(trim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1)),''), nullif(h->>'x-real-ip',''));
  return left(ip, 64);
end $$;
-- the trainer's row if the secret matches and the account is usable (not deleted)
create or replace function private.me(p_id uuid, p_secret text) returns public.players
language plpgsql security definer set search_path = public, extensions as $$
declare r public.players;
begin
  if p_id is null or p_secret is null then return null; end if;
  select * into r from public.players where id = p_id;
  if not found or r.deleted or r.secret_hash = 'removed' or r.secret_hash <> extensions.crypt(p_secret, r.secret_hash) then return null; end if;
  return r;
end $$;
create or replace function private.ip_ban_for(p_ip text) returns private.ip_bans language sql stable security definer set search_path = private as $$
  select * from private.ip_bans where p_ip is not null and ip = p_ip and (until is null or until > now()) limit 1
$$;
-- banned right now? (account ban or a ban on the address it's connecting from)
create or replace function private.ban_info(r public.players) returns json language plpgsql stable security definer set search_path = public, private as $$
declare b private.ip_bans;
begin
  if r.banned_until is not null and r.banned_until > now() then
    return json_build_object('until', case when r.banned_until > now() + interval '50 years' then null else r.banned_until end, 'reason', r.ban_reason, 'kind', 'account');
  end if;
  b := private.ip_ban_for(private.client_ip());
  if b.ip is not null then return json_build_object('until', b.until, 'reason', b.reason, 'kind', 'ip'); end if;
  return null;
end $$;
create or replace function private.clean_name(p text) returns text language sql immutable as $$
  select left(coalesce(nullif(regexp_replace(trim(coalesce(p,'')), '[[:cntrl:]<>]', '', 'g'), ''), 'Trainer'), 24)
$$;
-- a light filter for chat: common swear words become **** and links are removed
create or replace function private.clean_chat(p text) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(left(trim(regexp_replace(coalesce(p,''), '[[:cntrl:]]', ' ', 'g')), 300),
             '(https?://|www\.)\S+', '[link removed]', 'gi'),
           '\m(fuck\w*|shit\w*|bitch\w*|cunt\w*|dick|dicks|pussy|asshole\w*|bastard\w*|whore\w*|slut\w*|fag\w*|nigg\w*|retard\w*)\M', '****', 'gi')
$$;
create or replace function private.are_friends(a uuid, b uuid) returns boolean language sql stable security definer set search_path = private as $$
  select exists(select 1 from private.friends where status = 'accepted' and active and ((from_id = a and to_id = b) or (from_id = b and to_id = a)))
$$;
create or replace function private.blocked_either(a uuid, b uuid) returns boolean language sql stable security definer set search_path = private as $$
  select exists(select 1 from private.blocks where active and ((blocker = a and blocked = b) or (blocker = b and blocked = a)))
$$;
create or replace function private.is_online(t timestamptz) returns boolean language sql stable as $$ select t is not null and t > now() - interval '150 seconds' $$;
-- place on this season's PvP board for a given RP (1 = top)
create or replace function private.pvp_place(p_season text, p_rp integer) returns integer language sql stable security definer set search_path = private as $$
  select (count(*) + 1)::integer from private.season_scores x where x.season = p_season and not x.hidden and x.wins + x.losses > 0 and x.rp > coalesce(p_rp, 0)
$$;

-- ---------------------------------------------------------------- PvP settlement
-- RP: win vs a trainer +25, loss -15; win vs the computer +10, loss -5 (computer wins add at most 100 RP a day). Never below 0.
create or replace function private.season_row(p_player uuid) returns private.season_scores language plpgsql security definer set search_path = public, private as $$
declare s text := private.season_now(); r private.season_scores; p public.players;
begin
  select * into r from private.season_scores where season = s and player_id = p_player;
  if found then return r; end if;
  select * into p from public.players where id = p_player;
  insert into private.season_scores(season, player_id, name, avatar, look, power, level)
    values (s, p_player, private.clean_name(p.name), coalesce(p.avatar,'female'), p.look, coalesce(p.power,0), coalesce(p.level,1))
    on conflict (season, player_id) do nothing;
  select * into r from private.season_scores where season = s and player_id = p_player;
  return r;
end $$;
create or replace function private.apply_rp(p_player uuid, p_season text, p_delta integer, p_win boolean, p_bot boolean) returns integer
language plpgsql security definer set search_path = public, private as $$
declare r private.season_scores; d integer := p_delta; today date := (now() at time zone 'America/Detroit')::date;
begin
  perform private.season_row(p_player);
  select * into r from private.season_scores where season = p_season and player_id = p_player for update;
  if not found then return 0; end if;
  if p_bot and d > 0 then
    if r.bot_rp_day is distinct from today then r.bot_rp := 0; end if;
    d := greatest(0, least(d, 100 - r.bot_rp));
  end if;
  d := greatest(-r.rp, d);
  update private.season_scores set rp = rp + d,
     wins = wins + case when p_win then 1 else 0 end, losses = losses + case when p_win then 0 else 1 end,
     bot_rp = case when p_bot and p_delta > 0 then (case when bot_rp_day is distinct from today then 0 else bot_rp end) + d else bot_rp end,
     bot_rp_day = case when p_bot and p_delta > 0 then today else bot_rp_day end,
     updated_at = now()
   where season = p_season and player_id = p_player;
  return d;
end $$;
create or replace function private.pvp_settle(m private.pvp_matches) returns void language plpgsql security definer set search_path = public, private as $$
declare w uuid; l uuid; dw integer; dl integer;
begin
  if m.status <> 'active' then return; end if;
  if m.bot then
    if m.p1_result is null then return; end if;
    if m.p1_result = 'win' then dw := private.apply_rp(m.p1, m.season, 10, true, true); update private.pvp_matches set winner = m.p1, p1_delta = dw, status = 'done', settled_at = now() where id = m.id;
    else dl := private.apply_rp(m.p1, m.season, -5, false, true); update private.pvp_matches set p1_delta = dl, status = 'done', settled_at = now() where id = m.id; end if;
    return;
  end if;
  if m.p1_result is not null and m.p2_result is not null then
    if m.p1_result = m.p2_result then update private.pvp_matches set status = 'disputed', settled_at = now() where id = m.id; return; end if;
    if m.p1_result = 'win' then w := m.p1; l := m.p2; else w := m.p2; l := m.p1; end if;
  elsif m.created_at < now() - interval '4 minutes' and m.last_move_at < now() - interval '3 minutes' and (m.p1_result is not null or m.p2_result is not null) then
    -- the other trainer left without reporting: the report we have stands
    if coalesce(m.p1_result, case when m.p2_result = 'win' then 'loss' else 'win' end) = 'win' then w := m.p1; l := m.p2; else w := m.p2; l := m.p1; end if;
  elsif m.created_at < now() - interval '30 minutes' then
    update private.pvp_matches set status = 'abandoned', settled_at = now() where id = m.id; return;
  else
    return;
  end if;
  dw := private.apply_rp(w, m.season, 25, true, false);
  dl := private.apply_rp(l, m.season, -15, false, false);
  update private.pvp_matches set winner = w, status = 'done', settled_at = now(),
     p1_delta = case when w = m.p1 then dw else dl end, p2_delta = case when w = m.p2 then dw else dl end where id = m.id;
end $$;
create or replace function private.pvp_settle_stale() returns void language plpgsql security definer set search_path = public, private as $$
declare m private.pvp_matches;
begin
  for m in select * from private.pvp_matches where status = 'active' and created_at < now() - interval '4 minutes' order by created_at limit 20 for update skip locked loop
    perform private.pvp_settle(m);
  end loop;
end $$;

-- ---------------------------------------------------------------- public RPCs: account
-- register (refuses banned addresses)
create or replace function public.register_player(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public, extensions, private as $$
begin
  if p_id is null or p_secret is null or char_length(p_secret) < 32 then return false; end if;
  if (private.ip_ban_for(private.client_ip())).ip is not null then return false; end if;
  insert into public.players(id, secret_hash, last_ip) values (p_id, extensions.crypt(p_secret, extensions.gen_salt('bf', 8)), private.client_ip())
  on conflict (id) do nothing;
  return private.player_ok(p_id, p_secret);
end $$;

-- is this device's address banned? (asked on the sign-in screen)
create or replace function public.ip_status() returns json language plpgsql security definer set search_path = public, private as $$
declare b private.ip_bans;
begin
  b := private.ip_ban_for(private.client_ip());
  if b.ip is null then return json_build_object('banned', false); end if;
  return json_build_object('banned', true, 'until', b.until, 'reason', b.reason);
end $$;

-- every minute while playing: keeps "online" fresh, the profile current, and tells the game
-- about bans, removal, unread messages, friend requests and the trainer's season standing
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
    'requests', (select count(*) from private.friends f where f.to_id = p_id and f.status = 'pending' and f.active and not private.blocked_either(f.from_id, p_id)));
end $$;

-- scores now also feed the monthly season board
create or replace function public.submit_score(p_id uuid, p_secret text, p_name text, p_avatar text, p_power integer, p_level integer, p_totos integer)
returns boolean language plpgsql security definer set search_path = public, extensions, private as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret);
  if r.id is null or private.ban_info(r) is not null then return false; end if;
  insert into public.leaderboard(player_id, name, avatar, power, level, totos, updated_at)
  values (p_id, private.clean_name(p_name), case when p_avatar = 'male' then 'male' else 'female' end,
          greatest(0, least(p_power, 50000000)), greatest(1, least(p_level, 100)), greatest(0, least(p_totos, 100000)), now())
  on conflict (player_id) do update set name = excluded.name, avatar = excluded.avatar, power = excluded.power,
          level = excluded.level, totos = excluded.totos, updated_at = now();
  update public.players set name = private.clean_name(p_name), avatar = case when p_avatar = 'male' then 'male' else 'female' end,
     power = greatest(0, least(p_power, 50000000)), level = greatest(1, least(p_level, 100)), last_seen = now() where id = p_id;
  perform private.season_row(p_id);
  update private.season_scores set name = private.clean_name(p_name), avatar = case when p_avatar = 'male' then 'male' else 'female' end,
     power = greatest(0, least(p_power, 50000000)), level = greatest(1, least(p_level, 100)), totos = greatest(0, least(p_totos, 100000)), updated_at = now()
   where season = private.season_now() and player_id = p_id;
  return true;
end $$;

create or replace function public.delete_player(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public, extensions, private as $$
begin
  if not private.player_ok(p_id, p_secret) then return false; end if;
  perform private.wipe_player(p_id);
  return true;
end $$;
create or replace function private.wipe_player(p_target uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin
  update public.leaderboard set hidden = true, name = 'removed', avatar = 'female', power = 0, level = 1, totos = 0, updated_at = now() where player_id = p_target;
  update private.season_scores set hidden = true, name = 'removed' where player_id = p_target;
  update public.players set secret_hash = 'removed', deleted = true, name = 'removed', look = null, is_admin = false, is_owner = false where id = p_target;
  update private.friends set active = false where from_id = p_target or to_id = p_target;
  update private.messages set body = '[removed]' where from_id = p_target or to_id = p_target;
  update private.pvp_lobby set status = 'idle', match_id = null, updated_at = '-infinity' where player_id = p_target;
end $$;

-- ---------------------------------------------------------------- public RPCs: seasons
create or replace function public.season_board(p_board text, p_season text default null, p_limit integer default 100)
returns table(rank integer, player_id uuid, name text, avatar text, look jsonb, power integer, level integer, totos integer, rp integer, wins integer, losses integer)
language sql stable security definer set search_path = public, private as $$
  select (row_number() over (order by case when p_board = 'pvp' then s.rp else s.power end desc, s.wins desc, s.updated_at asc))::integer,
         s.player_id, s.name, s.avatar, s.look, s.power, s.level, s.totos, s.rp, s.wins, s.losses
    from private.season_scores s join public.players p on p.id = s.player_id
   where s.season = coalesce(p_season, private.season_now()) and not s.hidden and not p.deleted
     and (p.banned_until is null or p.banned_until < now())
     and (p_board <> 'pvp' or s.wins + s.losses > 0)
   order by 1 limit greatest(1, least(coalesce(p_limit, 100), 200))
$$;
create or replace function public.season_my_rank(p_id uuid, p_secret text, p_board text)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare r public.players; s private.season_scores; n integer;
begin
  r := private.me(p_id, p_secret); if r.id is null then return null; end if;
  select * into s from private.season_scores where season = private.season_now() and player_id = p_id;
  if not found then return json_build_object('rank', null); end if;
  if p_board = 'pvp' then select count(*) into n from private.season_scores x where x.season = s.season and not x.hidden and x.rp > s.rp;
  else select count(*) into n from private.season_scores x where x.season = s.season and not x.hidden and x.power > s.power; end if;
  return json_build_object('rank', n + 1, 'rp', s.rp, 'power', s.power, 'wins', s.wins, 'losses', s.losses);
end $$;
-- finished seasons the trainer hasn't collected rewards for yet (their final PvP place)
create or replace function public.season_claim(p_id uuid, p_secret text)
returns table(season text, rank integer, rp integer, wins integer)
language plpgsql security definer set search_path = public, private, extensions as $$
#variable_conflict use_column
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return; end if;
  return query
  with mine as (
    select s.season, s.rp, s.wins, s.updated_at from private.season_scores s
     where s.player_id = p_id and s.season < private.season_now() and not s.hidden and s.wins + s.losses > 0
       and not exists (select 1 from private.season_claims c where c.season = s.season and c.player_id = p_id)
  ), ranked as (
    select m.season, (select count(*) from private.season_scores x join public.players px on px.id = x.player_id
                        where x.season = m.season and not x.hidden and not px.deleted and x.wins + x.losses > 0
                          and (x.rp > m.rp or (x.rp = m.rp and (x.wins > m.wins or (x.wins = m.wins and x.updated_at < m.updated_at)))))::integer + 1 as rank,
           m.rp, m.wins from mine m
  ), ins as (
    insert into private.season_claims(season, player_id, rank, rp) select ranked.season, p_id, ranked.rank, ranked.rp from ranked on conflict do nothing returning private.season_claims.season
  )
  select ranked.season, ranked.rank, ranked.rp, ranked.wins from ranked;
end $$;

-- ---------------------------------------------------------------- public RPCs: PvP
create or replace function public.pvp_lobby_poll(p_id uuid, p_secret text, p_status text, p_toto jsonb, p_look jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; me private.pvp_lobby; opp private.pvp_lobby; m private.pvp_matches; s private.season_scores; v_season text := private.season_now();
begin
  r := private.me(p_id, p_secret);
  if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'banned', true); end if;
  if p_status = 'leave' then update private.pvp_lobby set status = 'idle', match_id = null, updated_at = '-infinity' where player_id = p_id; return json_build_object('ok', true); end if;
  s := private.season_row(p_id);
  insert into private.pvp_lobby(player_id, name, avatar, look, toto, rp, status, searching_since, updated_at)
  values (p_id, r.name, r.avatar, coalesce(p_look, r.look), p_toto, s.rp, case when p_status = 'searching' then 'searching' else 'idle' end,
          case when p_status = 'searching' then now() end, now())
  on conflict (player_id) do update set name = excluded.name, avatar = excluded.avatar, look = excluded.look,
     toto = coalesce(excluded.toto, private.pvp_lobby.toto), rp = excluded.rp, updated_at = now(),
     status = case when private.pvp_lobby.status in ('matched','battling') then private.pvp_lobby.status else excluded.status end,
     searching_since = case when excluded.status = 'searching' then coalesce(private.pvp_lobby.searching_since, now()) else null end;
  select * into me from private.pvp_lobby where player_id = p_id;
  -- a finished or stale match frees the trainer again
  if me.match_id is not null then
    select * into m from private.pvp_matches where id = me.match_id;
    if not found or m.status <> 'active' or m.created_at < now() - interval '10 minutes' then
      update private.pvp_lobby set status = case when p_status = 'searching' then 'searching' else 'idle' end, match_id = null where player_id = p_id;
      me.match_id := null; m := null;
    end if;
  end if;
  -- matchmaking: pair with the closest-ranked trainer who is also searching
  if me.match_id is null and p_status = 'searching' and p_toto is not null then
    select * into opp from private.pvp_lobby o
     where o.player_id <> p_id and o.status = 'searching' and o.match_id is null and o.updated_at > now() - interval '8 seconds' and o.toto is not null
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

-- nobody to fight after 30 s: a computer opponent (the game builds the opponent's Toto to match yours)
create or replace function public.pvp_start_bot(p_id uuid, p_secret text, p_toto jsonb, p_look jsonb, p_bot jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; s private.season_scores; recent integer;
begin
  r := private.me(p_id, p_secret);
  if r.id is null or private.ban_info(r) is not null then return json_build_object('ok', false); end if;
  select count(*) into recent from private.pvp_matches where p1 = p_id and bot and created_at > now() - interval '40 seconds';
  if recent > 0 then return json_build_object('ok', false, 'wait', true); end if;
  s := private.season_row(p_id);
  insert into private.pvp_matches(season, p1, p2, bot, seed, p1_name, p2_name, p1_look, p2_look, p1_toto, p2_toto, p1_rp, p2_rp)
  values (s.season, p_id, null, true, floor(random()*2147483646)::int + 1, r.name, left(coalesce(p_bot->>'name','Rival'), 24), coalesce(p_look, r.look), p_bot->'look', p_toto, p_bot->'toto', s.rp, coalesce((p_bot->>'rp')::int, s.rp))
  returning * into m;
  update private.pvp_lobby set status = 'battling', match_id = m.id, searching_since = null where player_id = p_id;
  return json_build_object('ok', true, 'id', m.id, 'seed', m.seed, 'created_at', m.created_at);
end $$;

-- one move per turn, in order; a trainer who goes quiet for 25 s can be moved for (auto attack)
create or replace function public.pvp_move(p_id uuid, p_secret text, p_match uuid, p_turn integer, p_action text, p_for_opponent boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; last_turn integer; who uuid;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match for update;
  if not found or m.bot or m.status <> 'active' or p_id not in (m.p1, m.p2) then return json_build_object('ok', false); end if;
  if p_action not in ('atk','s1','s2','s3','s4','ult','auto','forfeit') then return json_build_object('ok', false); end if;
  select coalesce(max(turn), 0) into last_turn from private.pvp_moves where match_id = p_match;
  if p_turn <> last_turn + 1 then return json_build_object('ok', false, 'turn', last_turn); end if;
  who := p_id;
  if p_for_opponent then
    if m.last_move_at > now() - interval '25 seconds' then return json_build_object('ok', false, 'early', true); end if;
    who := case when p_id = m.p1 then m.p2 else m.p1 end;
    p_action := 'auto';
  end if;
  insert into private.pvp_moves(match_id, turn, player_id, action) values (p_match, p_turn, who, p_action);
  update private.pvp_matches set last_move_at = now() where id = p_match;
  update private.pvp_lobby set status = 'battling' where player_id = p_id and match_id = p_match;
  return json_build_object('ok', true, 'turn', p_turn);
end $$;
create or replace function public.pvp_poll(p_id uuid, p_secret text, p_match uuid, p_since integer)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match;
  if not found or p_id not in (m.p1, coalesce(m.p2, m.p1)) then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'now', now(), 'status', m.status, 'last_move_at', m.last_move_at, 'winner', m.winner,
    'moves', coalesce((select json_agg(json_build_object('turn', mv.turn, 'player', mv.player_id, 'action', mv.action) order by mv.turn)
                        from private.pvp_moves mv where mv.match_id = p_match and mv.turn > coalesce(p_since, 0)), '[]'::json));
end $$;
create or replace function public.pvp_finish(p_id uuid, p_secret text, p_match uuid, p_result text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; m private.pvp_matches; s private.season_scores;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if p_result not in ('win','loss') then return json_build_object('ok', false); end if;
  select * into m from private.pvp_matches where id = p_match for update;
  if not found or p_id not in (m.p1, coalesce(m.p2, m.p1)) then return json_build_object('ok', false); end if;
  if m.status = 'active' then
    if m.bot and m.created_at > now() - interval '12 seconds' then p_result := 'loss'; end if;   -- too quick to be a real win
    if p_id = m.p1 and m.p1_result is null then update private.pvp_matches set p1_result = p_result where id = p_match returning * into m;
    elsif p_id = m.p2 and m.p2_result is null then update private.pvp_matches set p2_result = p_result where id = p_match returning * into m; end if;
    perform private.pvp_settle(m);
    select * into m from private.pvp_matches where id = p_match;
  end if;
  update private.pvp_lobby set status = 'idle', match_id = null where player_id = p_id;
  select * into s from private.season_scores where season = m.season and player_id = p_id;
  return json_build_object('ok', true, 'status', m.status, 'winner', m.winner,
    'delta', case when p_id = m.p1 then m.p1_delta else m.p2_delta end, 'rp', coalesce(s.rp, 0), 'wins', coalesce(s.wins,0), 'losses', coalesce(s.losses,0));
end $$;

-- ---------------------------------------------------------------- public RPCs: friends + messages
create or replace function public.search_players(p_id uuid, p_secret text, p_q text)
returns table(id uuid, name text, avatar text, level integer, look jsonb, online boolean, relation text)
language plpgsql stable security definer set search_path = public, private, extensions as $$
declare r public.players; q text := lower(trim(coalesce(p_q,'')));
begin
  r := private.me(p_id, p_secret); if r.id is null or char_length(q) < 2 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select p.id, p.name, p.avatar, p.level, p.look, private.is_online(p.last_seen),
         case when private.are_friends(p.id, p_id) then 'friend'
              when exists(select 1 from private.friends f where f.from_id = p_id and f.to_id = p.id and f.status = 'pending' and f.active) then 'sent'
              when exists(select 1 from private.friends f where f.from_id = p.id and f.to_id = p_id and f.status = 'pending' and f.active) then 'received'
              else 'none' end
    from public.players p
   where p.id <> p_id and not p.deleted and p.name is not null and lower(p.name) like q || '%'
     and (p.banned_until is null or p.banned_until < now()) and not private.blocked_either(p.id, p_id)
   order by (lower(p.name) = q) desc, p.last_seen desc nulls last limit 20;
end $$;
create or replace function public.friend_request(p_id uuid, p_secret text, p_to uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; t public.players; n integer;
begin
  r := private.me(p_id, p_secret); if r.id is null or private.ban_info(r) is not null then return json_build_object('ok', false); end if;
  select * into t from public.players where id = p_to and not deleted;
  if not found or p_to = p_id or private.blocked_either(p_id, p_to) then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if private.are_friends(p_id, p_to) then return json_build_object('ok', true, 'status', 'friend'); end if;
  if exists(select 1 from private.friends where from_id = p_to and to_id = p_id and status = 'pending' and active) then
    update private.friends set status = 'accepted' where from_id = p_to and to_id = p_id;
    return json_build_object('ok', true, 'status', 'friend');
  end if;
  select count(*) into n from private.friends where from_id = p_id and status = 'pending' and active;
  if n >= 50 then return json_build_object('ok', false, 'error', 'too_many'); end if;
  select count(*) into n from private.friends where (from_id = p_id or to_id = p_id) and status = 'accepted' and active;
  if n >= 200 then return json_build_object('ok', false, 'error', 'full'); end if;
  insert into private.friends(from_id, to_id) values (p_id, p_to)
    on conflict (from_id, to_id) do update set status = 'pending', active = true, created_at = now();
  return json_build_object('ok', true, 'status', 'sent');
end $$;
create or replace function public.friend_respond(p_id uuid, p_secret text, p_from uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if p_accept then update private.friends set status = 'accepted' where from_id = p_from and to_id = p_id and status = 'pending' and active;
  else update private.friends set active = false where from_id = p_from and to_id = p_id and status = 'pending'; end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.friend_remove(p_id uuid, p_secret text, p_other uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  update private.friends set active = false where (from_id = p_id and to_id = p_other) or (from_id = p_other and to_id = p_id);
  return json_build_object('ok', true);
end $$;
create or replace function public.block_player(p_id uuid, p_secret text, p_other uuid, p_block boolean default true)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null or p_other = p_id then return json_build_object('ok', false); end if;
  if p_block then
    insert into private.blocks(blocker, blocked) values (p_id, p_other) on conflict (blocker, blocked) do update set active = true, created_at = now();
    update private.friends set active = false where (from_id = p_id and to_id = p_other) or (from_id = p_other and to_id = p_id);
  else update private.blocks set active = false where blocker = p_id and blocked = p_other; end if;
  return json_build_object('ok', true);
end $$;
create or replace function public.friends_list(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  update public.players set last_seen = now() where id = p_id;
  return json_build_object('ok', true,
    'friends', coalesce((select json_agg(x order by x.online desc, x.last_msg desc nulls last, x.name) from (
        select p.id, p.name, p.avatar, p.level, p.look, private.is_online(p.last_seen) as online, p.last_seen,
               (select count(*) from private.messages m where m.from_id = p.id and m.to_id = p_id and m.read_at is null) as unread,
               (select max(m.created_at) from private.messages m where (m.from_id = p.id and m.to_id = p_id) or (m.from_id = p_id and m.to_id = p.id)) as last_msg,
               (select ss.rp from private.season_scores ss where ss.season = private.season_now() and ss.player_id = p.id) as rp
          from private.friends f join public.players p on p.id = case when f.from_id = p_id then f.to_id else f.from_id end
         where f.status = 'accepted' and f.active and (f.from_id = p_id or f.to_id = p_id) and not p.deleted) x), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar, 'level', p.level, 'look', p.look) order by f.created_at desc)
        from private.friends f join public.players p on p.id = f.from_id
       where f.to_id = p_id and f.status = 'pending' and f.active and not p.deleted and not private.blocked_either(p.id, p_id)), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar, 'level', p.level) order by f.created_at desc)
        from private.friends f join public.players p on p.id = f.to_id
       where f.from_id = p_id and f.status = 'pending' and f.active and not p.deleted), '[]'::json),
    'blocked', coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name)) from private.blocks b join public.players p on p.id = b.blocked where b.blocker = p_id and b.active), '[]'::json));
end $$;
create or replace function public.send_message(p_id uuid, p_secret text, p_to uuid, p_body text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; body text; n integer; mid bigint;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  if not private.are_friends(p_id, p_to) or private.blocked_either(p_id, p_to) then return json_build_object('ok', false, 'error', 'not_friends'); end if;
  body := private.clean_chat(p_body);
  if char_length(body) = 0 then return json_build_object('ok', false, 'error', 'empty'); end if;
  select count(*) into n from private.messages where from_id = p_id and created_at > now() - interval '1 minute';
  if n >= 15 then return json_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into private.messages(from_id, to_id, body) values (p_id, p_to, body) returning id into mid;
  return json_build_object('ok', true, 'id', mid, 'body', body);
end $$;
create or replace function public.get_messages(p_id uuid, p_secret text, p_other uuid, p_after bigint default 0)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  update private.messages set read_at = now() where from_id = p_other and to_id = p_id and read_at is null;
  return json_build_object('ok', true, 'messages', coalesce((select json_agg(x order by x.id) from (
      select m.id, m.from_id = p_id as mine, m.body, m.created_at from private.messages m
       where ((m.from_id = p_id and m.to_id = p_other) or (m.from_id = p_other and m.to_id = p_id)) and m.id > coalesce(p_after, 0)
       order by m.id desc limit 80) x), '[]'::json));
end $$;
create or replace function public.report_player(p_id uuid, p_secret text, p_other uuid, p_message bigint, p_reason text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; b text;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if (select count(*) from private.reports where reporter = p_id and created_at > now() - interval '1 hour') >= 10 then return json_build_object('ok', false, 'error', 'slow_down'); end if;
  select body into b from private.messages where id = p_message and from_id = p_other and to_id = p_id;
  insert into private.reports(reporter, reported, message_id, body, reason) values (p_id, p_other, p_message, b, left(coalesce(p_reason,''), 200));
  return json_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- public RPCs: admin
-- the owner unlocks admin tools on their own device once with the private admin key
create or replace function public.admin_claim(p_id uuid, p_secret text, p_key text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; h text;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select value into h from private.settings where name = 'admin_key_hash';
  if h is null or p_key is null or char_length(p_key) < 20 or h <> extensions.crypt(p_key, h) then perform pg_sleep(1.5); return json_build_object('ok', false); end if;
  update public.players set is_admin = true, is_owner = true where id = p_id;
  return json_build_object('ok', true, 'owner', true);
end $$;
-- called only by the google-auth server function after it has verified the owner's Google sign-in
create or replace function public.admin_grant_google(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' then return false; end if;
  r := private.me(p_id, p_secret); if r.id is null then return false; end if;
  update public.players set is_admin = true, is_owner = true where id = p_id;
  return true;
end $$;
create or replace function private.admin_me(p_id uuid, p_secret text) returns public.players language plpgsql security definer set search_path = public, private as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret);
  if r.id is null or not r.is_admin then return null; end if;
  return r;
end $$;
create or replace function public.admin_players(p_id uuid, p_secret text, p_search text, p_filter text, p_limit integer, p_offset integer)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; q text := lower(trim(coalesce(p_search,'')));
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return json_build_object('ok', true,
    'total', (select count(*) from public.players where not deleted and name is not null),
    'online', (select count(*) from public.players where not deleted and private.is_online(last_seen)),
    'banned', (select count(*) from public.players where not deleted and banned_until > now()),
    'reports', (select count(*) from private.reports where resolved_at is null),
    'players', coalesce((select json_agg(x) from (
      select p.id, p.name, p.avatar, p.level, p.power, p.look, p.created_at, p.last_seen, private.is_online(p.last_seen) as online,
             p.last_ip as ip, p.banned_until, p.ban_reason, p.is_admin, p.is_owner,
             (select ss.rp from private.season_scores ss where ss.season = private.season_now() and ss.player_id = p.id) as rp,
             exists(select 1 from private.ip_bans b where b.ip = p.last_ip and (b.until is null or b.until > now())) as ip_banned
        from public.players p
       where not p.deleted and p.name is not null and (q = '' or lower(p.name) like '%' || q || '%')
         and (coalesce(p_filter,'all') = 'all' or (p_filter = 'online' and private.is_online(p.last_seen)) or (p_filter = 'banned' and p.banned_until > now())
              or (p_filter = 'admins' and p.is_admin))
       order by private.is_online(p.last_seen) desc, p.last_seen desc nulls last, p.created_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::json));
end $$;
-- p_minutes: 0 or null = permanent; p_ip also bans the address the trainer last played from
create or replace function public.admin_ban(p_id uuid, p_secret text, p_target uuid, p_minutes integer, p_reason text, p_ip boolean)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; until_ts timestamptz;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if t.is_owner or (t.is_admin and not a.is_owner) or t.id = a.id then return json_build_object('ok', false, 'error', 'protected'); end if;
  until_ts := case when coalesce(p_minutes, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => least(p_minutes, 525600)) end;
  update public.players set banned_until = until_ts, ban_reason = left(coalesce(nullif(trim(p_reason),''), 'Breaking the game rules'), 200) where id = p_target;
  update private.pvp_lobby set status = 'idle', match_id = null, updated_at = '-infinity' where player_id = p_target;
  if p_ip and t.last_ip is not null and t.last_ip <> coalesce(a.last_ip, '') then
    insert into private.ip_bans(ip, until, reason, player_id, created_by) values (t.last_ip, case when until_ts = 'infinity' then null else until_ts end, left(coalesce(p_reason,''),200), p_target, p_id)
      on conflict (ip) do update set until = excluded.until, reason = excluded.reason, player_id = excluded.player_id, created_by = excluded.created_by, created_at = now();
  end if;
  return json_build_object('ok', true, 'until', case when until_ts = 'infinity' then null else until_ts end, 'ip', p_ip and t.last_ip is not null);
end $$;
create or replace function public.admin_unban(p_id uuid, p_secret text, p_target uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  update public.players set banned_until = null, ban_reason = null where id = p_target;
  update private.ip_bans set until = now() - interval '1 second' where player_id = p_target or ip = (select last_ip from public.players where id = p_target);
  return json_build_object('ok', true);
end $$;
create or replace function public.admin_delete(p_id uuid, p_secret text, p_target uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  select * into t from public.players where id = p_target;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if t.is_owner or (t.is_admin and not a.is_owner) or t.id = a.id then return json_build_object('ok', false, 'error', 'protected'); end if;
  perform private.wipe_player(p_target);
  return json_build_object('ok', true);
end $$;
create or replace function public.admin_set_admin(p_id uuid, p_secret text, p_target uuid, p_on boolean)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  update public.players set is_admin = p_on where id = p_target and not deleted and not is_owner;
  return json_build_object('ok', true);
end $$;
create or replace function public.admin_reports(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'reports', coalesce((select json_agg(x) from (
    select r.id, r.created_at, r.reason, r.body, r.reported, pr.name as reported_name, rp.name as reporter_name
      from private.reports r left join public.players pr on pr.id = r.reported left join public.players rp on rp.id = r.reporter
     where r.resolved_at is null order by r.created_at desc limit 100) x), '[]'::json));
end $$;
create or replace function public.admin_resolve_report(p_id uuid, p_secret text, p_report bigint)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  update private.reports set resolved_at = now() where id = p_report;
  return json_build_object('ok', true);
end $$;

-- (nothing in the private schema is reachable from the app: anon/authenticated have no USAGE on it)
