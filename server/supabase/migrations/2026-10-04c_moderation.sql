-- TotoQuest v78: moderation. Admins can mute a player (no chat messages) for a while or for good, act
-- straight from a report (mute / ban / remove the message / no action), and a reported message is
-- taken out of the chat once action is taken. Additive only (new columns, replaced functions).

alter table public.players add column if not exists muted_until timestamptz;
alter table public.players add column if not exists mute_reason text;
alter table private.messages add column if not exists removed_at timestamptz;

-- muted players can't send chat messages
create or replace function public.send_message(p_id uuid, p_secret text, p_to uuid, p_body text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; body text; n integer; mid bigint;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  if private.ban_info(r) is not null then return json_build_object('ok', false, 'error', 'banned'); end if;
  if r.muted_until is not null and r.muted_until > now() then
    return json_build_object('ok', false, 'error', 'muted', 'until', case when r.muted_until = 'infinity' then null else r.muted_until end, 'reason', r.mute_reason);
  end if;
  if not private.are_friends(p_id, p_to) or private.blocked_either(p_id, p_to) then return json_build_object('ok', false, 'error', 'not_friends'); end if;
  body := private.clean_chat(p_body);
  if char_length(body) = 0 then return json_build_object('ok', false, 'error', 'empty'); end if;
  select count(*) into n from private.messages where from_id = p_id and created_at > now() - interval '1 minute';
  if n >= 15 then return json_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into private.messages(from_id, to_id, body) values (p_id, p_to, body) returning id into mid;
  return json_build_object('ok', true, 'id', mid, 'body', body);
end $$;

-- removed messages leave the chat for both players
create or replace function public.get_messages(p_id uuid, p_secret text, p_other uuid, p_after bigint default 0)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  update private.messages set read_at = now() where from_id = p_other and to_id = p_id and read_at is null;
  return json_build_object('ok', true,
    'muted', case when r.muted_until is not null and r.muted_until > now() then coalesce(to_char(r.muted_until, 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'forever') else null end,
    'removed', coalesce((select json_agg(m.id) from private.messages m
                          where ((m.from_id = p_id and m.to_id = p_other) or (m.from_id = p_other and m.to_id = p_id)) and m.removed_at is not null
                            and m.removed_at > now() - interval '30 days'), '[]'::json),
    'messages', coalesce((select json_agg(x order by x.id) from (
      select m.id, m.from_id = p_id as mine, m.body, m.created_at from private.messages m
       where ((m.from_id = p_id and m.to_id = p_other) or (m.from_id = p_other and m.to_id = p_id)) and m.id > coalesce(p_after, 0)
         and m.removed_at is null
       order by m.id desc limit 80) x), '[]'::json));
end $$;

create or replace function public.admin_mute(p_id uuid, p_secret text, p_target uuid, p_minutes integer, p_reason text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; until_ts timestamptz;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if t.is_owner or (t.is_admin and not a.is_owner) or t.id = a.id then return json_build_object('ok', false, 'error', 'protected'); end if;
  until_ts := case when coalesce(p_minutes, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => least(p_minutes, 525600)) end;
  update public.players set muted_until = until_ts, mute_reason = left(coalesce(nullif(trim(p_reason), ''), 'Breaking the chat rules'), 200) where id = p_target;
  return json_build_object('ok', true, 'until', case when until_ts = 'infinity' then null else until_ts end);
end $$;

create or replace function public.admin_unmute(p_id uuid, p_secret text, p_target uuid)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  update public.players set muted_until = null, mute_reason = null where id = p_target;
  return json_build_object('ok', true);
end $$;

-- act on a report: 'mute' / 'ban' (for p_minutes, 0 = for good), 'remove' (just the message) or 'dismiss'.
-- Muting, banning or removing takes the reported message out of the chat; the report (and any other open
-- report of the same message) is marked handled with what was done.
create or replace function public.admin_report_action(p_id uuid, p_secret text, p_report bigint, p_action text, p_minutes integer default 0, p_reason text default null, p_ip boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; rp private.reports; target uuid; res json; removed boolean := false;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  if p_action not in ('mute','ban','remove','dismiss') then return json_build_object('ok', false, 'error', 'bad_action'); end if;
  select * into rp from private.reports where id = p_report;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  target := case when rp.reported = rp.reporter then null else rp.reported end;
  if p_action in ('mute','ban') then
    if target is null then return json_build_object('ok', false, 'error', 'no_player'); end if;
    if p_action = 'mute' then res := public.admin_mute(p_id, p_secret, target, p_minutes, p_reason);
    else res := public.admin_ban(p_id, p_secret, target, p_minutes, p_reason, coalesce(p_ip, false)); end if;
    if coalesce((res->>'ok')::boolean, false) = false then return res; end if;
  end if;
  if p_action <> 'dismiss' and rp.message_id is not null then
    update private.messages set removed_at = now() where id = rp.message_id and removed_at is null;
    removed := true;
  end if;
  update private.reports set resolved_at = now(), resolved_by = p_id,
         details = coalesce(details, '{}'::jsonb) || jsonb_build_object('action', p_action, 'minutes', coalesce(p_minutes, 0), 'action_reason', private.clean_text(p_reason, 200))
   where resolved_at is null and (id = p_report or (rp.message_id is not null and message_id = rp.message_id));
  return json_build_object('ok', true, 'removed', removed, 'until', res->'until');
end $$;

-- reports list: 'chat' = reports about players and their messages, 'issues' = bugs/glitches/store/other;
-- each report now says whether its message was removed and whether the player is muted or banned
create or replace function public.admin_reports2(p_id uuid, p_secret text, p_kind text default 'all', p_resolved boolean default false)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true,
    'counts', (select json_object_agg(k, n) from (select kind as k, count(*) as n from private.reports where resolved_at is null group by kind) c),
    'reports', coalesce((select json_agg(x) from (
      select r.id, r.kind, r.created_at, r.reason, r.body, r.details, r.context, r.message_id, r.resolved_at,
             case when r.reported = r.reporter then null else r.reported end as reported,
             case when r.reported = r.reporter then null else pr.name end as reported_name, r.reporter, rp.name as reporter_name, rb.name as resolved_by_name,
             case when r.reported = r.reporter then null else pr.muted_until end as reported_muted_until,
             case when r.reported = r.reporter then null else pr.banned_until end as reported_banned_until,
             (select m.removed_at from private.messages m where m.id = r.message_id) as message_removed_at
        from private.reports r left join public.players pr on pr.id = r.reported left join public.players rp on rp.id = r.reporter
             left join public.players rb on rb.id = r.resolved_by
       where (case when coalesce(p_resolved, false) then r.resolved_at is not null else r.resolved_at is null end)
         and (coalesce(p_kind, 'all') = 'all' or r.kind = p_kind
              or (p_kind = 'chat' and r.kind in ('player','message'))
              or (p_kind = 'issues' and r.kind in ('bug','glitch','store','other')))
       order by coalesce(r.resolved_at, r.created_at) desc limit 100) x), '[]'::json));
end $$;

-- the players list also says who is muted (and can show just the muted ones)
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
    'muted', (select count(*) from public.players where not deleted and muted_until > now()),
    'reports', (select count(*) from private.reports where resolved_at is null),
    'players', coalesce((select json_agg(x) from (
      select p.id, p.name, p.avatar, p.level, p.power, p.look, p.created_at, p.last_seen, private.is_online(p.last_seen) as online,
             p.last_ip as ip, p.banned_until, p.ban_reason, p.muted_until, p.mute_reason, p.is_admin, p.is_owner,
             (select ss.rp from private.season_scores ss where ss.season = private.season_now() and ss.player_id = p.id) as rp,
             exists(select 1 from private.ip_bans b where b.ip = p.last_ip and (b.until is null or b.until > now())) as ip_banned,
             (select count(*) from private.reports r where r.reported = p.id and r.reported <> r.reporter) as times_reported
        from public.players p
       where not p.deleted and p.name is not null and (q = '' or lower(p.name) like '%' || q || '%')
         and (coalesce(p_filter,'all') = 'all' or (p_filter = 'online' and private.is_online(p.last_seen)) or (p_filter = 'banned' and p.banned_until > now())
              or (p_filter = 'muted' and p.muted_until > now()) or (p_filter = 'admins' and p.is_admin))
       order by private.is_online(p.last_seen) desc, p.last_seen desc nulls last, p.created_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::json));
end $$;
