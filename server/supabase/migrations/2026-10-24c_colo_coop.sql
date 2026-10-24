-- TotoQuest v110: team up in the Ultimate Colosseum. Up to 4 trainers join a party, each brings ONE
-- Toto, and together they fight a Colosseum stage against the computer. A party has a chat.
-- Every phone replays the battle with the same seeded engine: trainers' moves go through
-- colo_party_move in order; the computer's turns are worked out on each phone ("ai").
-- Additive only (new tables + new functions).

create table if not exists private.colo_parties (
  id uuid primary key default gen_random_uuid(),
  host uuid not null,
  stage integer not null check (stage between 1 and 10),
  status text not null default 'lobby' check (status in ('lobby','battle','done','closed')),
  seed integer,
  members jsonb not null default '[]'::jsonb,       -- [{id, name, toto:{name, level} | null}] in seat order
  winner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists colo_parties_open on private.colo_parties (status, updated_at);
create table if not exists private.colo_party_moves (
  party_id uuid not null references private.colo_parties(id) on delete cascade,
  turn integer not null,
  player_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),
  primary key (party_id, turn)
);
create table if not exists private.colo_party_chat (
  id bigserial primary key,
  party_id uuid not null references private.colo_parties(id) on delete cascade,
  player_id uuid not null,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists colo_party_chat_party on private.colo_party_chat (party_id, id);
alter table private.colo_parties enable row level security;
alter table private.colo_party_moves enable row level security;
alter table private.colo_party_chat enable row level security;

create or replace function private.colo_party_view(p private.colo_parties, p_me uuid, p_since_chat bigint, p_since_turn integer) returns json
language sql stable security definer set search_path = public, private as $$
  select json_build_object('ok', true, 'id', p.id, 'host', p.host, 'stage', p.stage, 'status', p.status, 'seed', p.seed, 'winner', p.winner,
    'members', p.members, 'me', p_me, 'now', now(),
    'chat', coalesce((select json_agg(json_build_object('id', c.id, 'from', c.player_id, 'name', c.name, 'body', c.body) order by c.id)
                       from (select * from private.colo_party_chat c where c.party_id = p.id and c.id > coalesce(p_since_chat, 0) order by c.id desc limit 40) c), '[]'::json),
    'moves', coalesce((select json_agg(json_build_object('turn', m.turn, 'player', m.player_id, 'action', m.action) order by m.turn)
                        from private.colo_party_moves m where m.party_id = p.id and m.turn > coalesce(p_since_turn, 0)), '[]'::json),
    'last_move_at', (select max(created_at) from private.colo_party_moves m where m.party_id = p.id));
$$;

create or replace function private.colo_seat(p private.colo_parties, p_id uuid) returns integer
language sql immutable as $$
  select (select ord - 1 from jsonb_array_elements(p.members) with ordinality e(m, ord) where (m->>'id')::uuid = p_id limit 1)::integer;
$$;

-- create a party (you are the host), or list open parties to join
create or replace function public.colo_party_create(p_id uuid, p_secret text, p_stage integer)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  update private.colo_parties set status = 'closed', updated_at = now() where host = p_id and status = 'lobby';
  insert into private.colo_parties(host, stage, members) values (p_id, least(greatest(coalesce(p_stage, 1), 1), 10),
    jsonb_build_array(jsonb_build_object('id', p_id, 'name', coalesce(r.name, 'Trainer'), 'toto', null)))
    returning * into p;
  return private.colo_party_view(p, p_id, 0, 0);
end $$;

create or replace function public.colo_party_list(p_id uuid, p_secret text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'parties', coalesce((select json_agg(json_build_object('id', p.id, 'stage', p.stage, 'host', p.host,
      'host_name', p.members->0->>'name', 'count', jsonb_array_length(p.members), 'members', p.members) order by p.updated_at desc)
    from private.colo_parties p where p.status = 'lobby' and p.updated_at > now() - interval '2 minutes' and jsonb_array_length(p.members) < 4
      and not private.blocked_either(p.host, p_id)), '[]'::json));
end $$;

create or replace function public.colo_party_join(p_id uuid, p_secret text, p_party uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found or p.status <> 'lobby' then return json_build_object('ok', false, 'error', 'gone'); end if;
  if private.colo_seat(p, p_id) is null then
    if jsonb_array_length(p.members) >= 4 then return json_build_object('ok', false, 'error', 'full'); end if;
    if private.blocked_either(p.host, p_id) then return json_build_object('ok', false, 'error', 'gone'); end if;
    update private.colo_parties set members = members || jsonb_build_array(jsonb_build_object('id', p_id, 'name', coalesce(r.name, 'Trainer'), 'toto', null)), updated_at = now()
     where id = p_party returning * into p;
  end if;
  return private.colo_party_view(p, p_id, 0, 0);
end $$;

create or replace function public.colo_party_leave(p_id uuid, p_secret text, p_party uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found then return json_build_object('ok', true); end if;
  if p.status = 'lobby' then
    if p.host = p_id then update private.colo_parties set status = 'closed', updated_at = now() where id = p_party;
    else update private.colo_parties set members = coalesce((select jsonb_agg(m order by ord) from jsonb_array_elements(members) with ordinality e(m, ord) where (m->>'id')::uuid <> p_id), '[]'::jsonb), updated_at = now() where id = p_party; end if;
  end if;
  return json_build_object('ok', true);
end $$;

-- pick your ONE Toto for the party (name + level, the same snapshot PvP uses)
create or replace function public.colo_party_pick(p_id uuid, p_secret text, p_party uuid, p_toto jsonb)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties; seat integer; t jsonb;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found or p.status <> 'lobby' then return json_build_object('ok', false, 'error', 'gone'); end if;
  seat := private.colo_seat(p, p_id); if seat is null then return json_build_object('ok', false, 'error', 'not_member'); end if;
  if p_toto is null or jsonb_typeof(p_toto) <> 'object' or coalesce(p_toto->>'name', '') = '' then t := null;
  else t := jsonb_build_object('name', left(p_toto->>'name', 40), 'level', least(greatest(coalesce((p_toto->>'level')::integer, 1), 1), 100), 'ev', coalesce((p_toto->>'ev')::integer, 0)); end if;
  update private.colo_parties set members = jsonb_set(members, array[seat::text, 'toto'], coalesce(t, 'null'::jsonb)), updated_at = now() where id = p_party returning * into p;
  return private.colo_party_view(p, p_id, 0, 0);
end $$;

create or replace function public.colo_party_chat(p_id uuid, p_secret text, p_party uuid, p_body text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties; body text;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  if r.muted_until is not null and r.muted_until > now() then return json_build_object('ok', false, 'error', 'muted'); end if;
  select * into p from private.colo_parties where id = p_party;
  if not found or private.colo_seat(p, p_id) is null then return json_build_object('ok', false, 'error', 'not_member'); end if;
  body := private.clean_chat(p_body);
  if body is null or body = '' then return json_build_object('ok', false); end if;
  if (select count(*) from private.colo_party_chat where party_id = p_party and player_id = p_id and created_at > now() - interval '10 seconds') >= 5 then
    return json_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into private.colo_party_chat(party_id, player_id, name, body) values (p_party, p_id, coalesce(r.name, 'Trainer'), body);
  return json_build_object('ok', true);
end $$;

create or replace function public.colo_party_poll(p_id uuid, p_secret text, p_party uuid, p_since_chat bigint, p_since_turn integer)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party;
  if not found then return json_build_object('ok', false, 'error', 'gone'); end if;
  if private.colo_seat(p, p_id) is null then return json_build_object('ok', false, 'error', 'not_member'); end if;
  if p.status = 'lobby' and p.host = p_id then update private.colo_parties set updated_at = now() where id = p_party; end if;
  return private.colo_party_view(p, p_id, p_since_chat, p_since_turn);
end $$;

-- the host starts once everyone has picked a Toto (2 to 4 trainers)
create or replace function public.colo_party_start(p_id uuid, p_secret text, p_party uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found or p.host <> p_id or p.status <> 'lobby' then return json_build_object('ok', false, 'error', 'not_host'); end if;
  if jsonb_array_length(p.members) < 2 then return json_build_object('ok', false, 'error', 'need_two'); end if;
  if exists (select 1 from jsonb_array_elements(p.members) m where m->'toto' is null or jsonb_typeof(m->'toto') <> 'object') then
    return json_build_object('ok', false, 'error', 'not_ready'); end if;
  update private.colo_parties set status = 'battle', seed = floor(random()*2147483646)::int + 1, updated_at = now() where id = p_party returning * into p;
  return private.colo_party_view(p, p_id, 0, 0);
end $$;

-- a trainer's move on their side's turn: "<seat>:<skill>:<target>" for the seat they control, or
-- "ai" (let the computer play the turn; anyone may send it for a trainer who has been idle 25 s)
create or replace function public.colo_party_move(p_id uuid, p_secret text, p_party uuid, p_turn integer, p_action text, p_for_seat integer default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties; last_turn integer; seat integer; last_at timestamptz;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found or p.status <> 'battle' then return json_build_object('ok', false, 'error', 'gone'); end if;
  seat := private.colo_seat(p, p_id); if seat is null then return json_build_object('ok', false, 'error', 'not_member'); end if;
  if p_action is null or p_action !~ '^([0-3]:(s1|s2|s3|s4|ult):[0-3]|ai|pass)$' then return json_build_object('ok', false); end if;
  if p_action ~ '^[0-3]:' and split_part(p_action, ':', 1)::integer <> seat then return json_build_object('ok', false, 'error', 'not_your_toto'); end if;
  if p_turn < 1 or p_turn % 2 = 0 then return json_build_object('ok', false); end if;
  select coalesce(max(turn), 0), max(created_at) into last_turn, last_at from private.colo_party_moves where party_id = p_party;
  if p_turn <= last_turn then return json_build_object('ok', false, 'turn', last_turn); end if;
  if p_action = 'ai' and p_for_seat is not null and p_for_seat <> seat and coalesce(last_at, p.updated_at) > now() - interval '25 seconds' then
    return json_build_object('ok', false, 'early', true); end if;
  insert into private.colo_party_moves(party_id, turn, player_id, action) values (p_party, p_turn, p_id, p_action);
  update private.colo_parties set updated_at = now() where id = p_party;
  return json_build_object('ok', true, 'turn', p_turn);
end $$;

create or replace function public.colo_party_finish(p_id uuid, p_secret text, p_party uuid, p_result text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; p private.colo_parties;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  select * into p from private.colo_parties where id = p_party for update;
  if not found or private.colo_seat(p, p_id) is null then return json_build_object('ok', false); end if;
  if p.status = 'battle' then update private.colo_parties set status = 'done', winner = case when p_result = 'win' then 'p1' else 'p2' end, updated_at = now() where id = p_party; end if;
  return json_build_object('ok', true);
end $$;

-- old parties are tidied away
create or replace function private.colo_party_cleanup() returns void language sql security definer set search_path = private as $$
  delete from private.colo_parties where updated_at < now() - interval '1 day';
$$;
