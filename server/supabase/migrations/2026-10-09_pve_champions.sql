-- TotoQuest v80: PvE Champions. Finishing a monthly season in the PvE (power) top 10 earns that place's
-- PvE Champion Toto, the same way the PvP top 10 earn their Rank Champions. A finished season's PvE
-- place is worked out once (the first heartbeat after the season ends) and kept in private.pve_claims,
-- and the heartbeat hands the trainer's top-10 PvE finishes back on every device ("pve_awards").
-- Additive only (a new table, a new helper, the heartbeat replaced with the same signature).

create table if not exists private.pve_claims (
  season     text not null,
  player_id  uuid not null,
  rank       integer,
  power      integer,
  claimed_at timestamptz not null default now(),
  primary key (season, player_id)
);

-- the trainer's final PvE place in every finished season they played (ranked like the PvE board:
-- power, then wins, then who got there first; hidden, deleted and banned trainers don't count)
create or replace function private.pve_settle(p_id uuid)
returns void language plpgsql security definer set search_path = public, private, extensions as $$
begin
  insert into private.pve_claims(season, player_id, rank, power)
  select s.season, p_id,
         (select count(*) from private.season_scores x join public.players px on px.id = x.player_id
           where x.season = s.season and not x.hidden and not px.deleted and x.power > 0
             and (px.banned_until is null or px.banned_until < now())
             and (x.power > s.power or (x.power = s.power and (x.wins > s.wins or (x.wins = s.wins and x.updated_at < s.updated_at)))))::integer + 1,
         s.power
    from private.season_scores s
   where s.player_id = p_id and s.season < private.season_now() and not s.hidden and coalesce(s.power, 0) > 0
     and not exists (select 1 from private.pve_claims c where c.season = s.season and c.player_id = p_id)
  on conflict do nothing;
end $$;

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
    perform private.pve_settle(p_id);
  end if;
  select * into s from private.season_scores ss where ss.season = v_season and ss.player_id = p_id;
  return json_build_object('ok', true, 'now', now(), 'season', v_season, 'ban', b, 'admin', r.is_admin, 'owner', r.is_owner,
    'rp', coalesce(s.rp, 0), 'wins', coalesce(s.wins, 0), 'losses', coalesce(s.losses, 0), 'place', private.pvp_place(v_season, s.rp),
    'unread', (select count(*) from private.messages m where m.to_id = p_id and m.read_at is null and not private.blocked_either(m.from_id, p_id)),
    'requests', (select count(*) from private.friends f where f.to_id = p_id and f.status = 'pending' and f.active and not private.blocked_either(f.from_id, p_id)),
    'trades', (select count(*) from private.trades t where (t.to_id = p_id and t.status = 'offered') or (t.from_id = p_id and t.status = 'countered')),
    'gifts', case when b is null then (select count(*) from private.gifts g where g.player_id = p_id and g.claimed_at is null) else 0 end,
    'awards', coalesce((select json_agg(json_build_object('season', c.season, 'rank', c.rank, 'rp', c.rp) order by c.season)
                          from private.season_claims c where c.player_id = p_id and c.rank between 1 and 10 and c.season < v_season), '[]'::json),
    'pve_awards', coalesce((select json_agg(json_build_object('season', c.season, 'rank', c.rank, 'power', c.power) order by c.season)
                          from private.pve_claims c where c.player_id = p_id and c.rank between 1 and 10 and c.season < v_season), '[]'::json));
end $$;
