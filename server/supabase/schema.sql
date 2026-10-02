-- TotoQuest online backend (Supabase / Postgres) — matches what runs in the live project.
-- * players      : one row per trainer; a random id + a hashed secret only that trainer's phone knows
-- * leaderboard  : public, read by everyone; written only through submit_score() with the secret
-- * purchases    : written only by the Stripe webhook (service role); collected through claim_purchases()
-- Nothing here is writable directly with the public (publishable / anon) key: the tables have row
-- level security with no write policies, and the helper that checks secrets lives in the
-- `private` schema, which the API doesn't expose.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.players (
  id          uuid primary key,
  secret_hash text not null,
  created_at  timestamptz not null default now()
);
alter table public.players enable row level security;            -- no policies: never readable/writable from the app

create table if not exists public.leaderboard (
  player_id  uuid primary key references public.players(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 24),
  avatar     text not null default 'female' check (avatar in ('female','male')),
  power      integer not null default 0 check (power between 0 and 50000000),
  level      integer not null default 1 check (level between 1 and 100),
  totos      integer not null default 0 check (totos between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.leaderboard enable row level security;
create policy "leaderboard is public" on public.leaderboard for select using (true);
-- trainers who delete their account: the row is wiped and hidden from everyone
alter table public.leaderboard add column if not exists hidden boolean not null default false;
create policy "removed trainers are hidden" on public.leaderboard as restrictive for select using (not hidden);
create index if not exists leaderboard_power_idx on public.leaderboard (power desc);

create table if not exists public.purchases (
  session_id        text primary key,                 -- Stripe Checkout Session id (one credit per payment)
  player_id         uuid not null,
  kind              text not null check (kind in ('candy','gems')),
  amount            integer not null check (amount > 0),
  amount_paid_cents integer,
  currency          text,
  livemode          boolean,
  created_at        timestamptz not null default now(),
  claimed_at        timestamptz
);
alter table public.purchases enable row level security;          -- no policies
create index if not exists purchases_unclaimed_idx on public.purchases (player_id) where claimed_at is null;

-- private settings (the Stripe webhook signing secret) — the private schema isn't exposed by the API
create schema if not exists private;
create table if not exists private.settings (name text primary key, value text not null);

-- only the server (service role, i.e. the webhook function) gets an answer; anyone else gets null
create or replace function public.tq_get_setting(p_name text)
returns text language plpgsql security definer set search_path = private, public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' then return null; end if;
  return (select value from private.settings where name = p_name);
end $$;

create or replace function private.player_ok(p_id uuid, p_secret text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists(select 1 from public.players where id = p_id and secret_hash = extensions.crypt(p_secret, secret_hash))
$$;

-- first launch with the online features on: the phone registers its id + secret
create or replace function public.register_player(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_id is null or p_secret is null or char_length(p_secret) < 32 then return false; end if;
  insert into public.players(id, secret_hash) values (p_id, extensions.crypt(p_secret, extensions.gen_salt('bf', 8)))
  on conflict (id) do nothing;
  return private.player_ok(p_id, p_secret);
end $$;

create or replace function public.submit_score(p_id uuid, p_secret text, p_name text, p_avatar text, p_power integer, p_level integer, p_totos integer)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not private.player_ok(p_id, p_secret) then return false; end if;
  insert into public.leaderboard(player_id, name, avatar, power, level, totos, updated_at)
  values (p_id, left(coalesce(nullif(trim(p_name), ''), 'Trainer'), 24), case when p_avatar = 'male' then 'male' else 'female' end,
          greatest(0, least(p_power, 50000000)), greatest(1, least(p_level, 100)), greatest(0, least(p_totos, 100000)), now())
  on conflict (player_id) do update set name = excluded.name, avatar = excluded.avatar, power = excluded.power,
          level = excluded.level, totos = excluded.totos, updated_at = now();
  return true;
end $$;

-- the game collects anything bought for this trainer that it hasn't received yet (each payment once)
create or replace function public.claim_purchases(p_id uuid, p_secret text)
returns table(session_id text, kind text, amount integer)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not private.player_ok(p_id, p_secret) then return; end if;
  return query
    update public.purchases p set claimed_at = now()
    where p.player_id = p_id and p.claimed_at is null
    returning p.session_id, p.kind, p.amount;
end $$;

-- "Delete my account" in Settings: wipes and hides the leaderboard entry and retires the secret.
-- Purchase records are kept for tax/accounting.
create or replace function public.delete_player(p_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not private.player_ok(p_id, p_secret) then return false; end if;
  update public.leaderboard set hidden = true, name = 'removed', avatar = 'female', power = 0, level = 1, totos = 0, updated_at = now()
   where player_id = p_id;
  update public.players set secret_hash = 'removed' where id = p_id;
  return true;
end $$;

-- settings read only by the server functions (never commit real values):
-- insert into private.settings(name, value) values ('admin_email', 'owner@example.com');          -- unlocks owner tools after Google sign-in
-- insert into private.settings(name, value) values ('google_client_id', '….apps.googleusercontent.com');
-- after creating the Stripe webhook endpoint, store its signing secret (never commit the real value):
-- insert into private.settings(name, value) values ('stripe_webhook_secret', 'whsec_...')
--   on conflict (name) do update set value = excluded.value;
