-- TotoQuest v77: in-game reports. Players report a chat message (the admins see the message and the
-- conversation around it) or a bug, glitch, store problem, player or anything else, with a written
-- description; bug reports carry the game version and device to help track them down.

alter table private.reports add column if not exists kind text not null default 'player';
alter table private.reports add column if not exists details jsonb;
alter table private.reports add column if not exists context jsonb;
alter table private.reports add column if not exists resolved_by uuid;

create or replace function private.clean_text(t text, n integer) returns text language sql immutable as $$
  select nullif(left(regexp_replace(trim(coalesce(t, '')), '[[:cntrl:]]', ' ', 'g'), n), '')
$$;

-- a chat message from a friend (p_message, theirs) or the player in general (p_message null)
create or replace function public.report_message(p_id uuid, p_secret text, p_other uuid, p_message bigint, p_category text, p_text text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; b text; ctx jsonb; rid bigint;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if (select count(*) from private.reports where reporter = p_id and created_at > now() - interval '1 hour') >= 10 then return json_build_object('ok', false, 'error', 'slow_down'); end if;
  if not exists (select 1 from public.players where id = p_other) then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if p_message is not null then
    select body into b from private.messages where id = p_message and from_id = p_other and to_id = p_id;
    if b is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  -- the conversation up to the reported message (or the latest), so the admins see what was said
  select jsonb_agg(jsonb_build_object('id', m.id, 'who', case when m.from_id = p_id then 'reporter' else 'reported' end, 'body', m.body, 'at', m.created_at) order by m.id)
    into ctx from (select * from private.messages m
                    where ((m.from_id = p_id and m.to_id = p_other) or (m.from_id = p_other and m.to_id = p_id))
                      and (p_message is null or m.id <= p_message)
                    order by m.id desc limit 12) m;
  insert into private.reports(reporter, reported, message_id, body, reason, kind, details, context)
    values (p_id, p_other, p_message, b, coalesce(private.clean_text(p_category, 60), 'Other'),
            case when p_message is null then 'player' else 'message' end,
            jsonb_build_object('text', private.clean_text(p_text, 1000)), ctx)
    returning id into rid;
  return json_build_object('ok', true, 'id', rid);
end $$;

-- old games: report the latest message (kept working, now with the conversation attached)
create or replace function public.report_player(p_id uuid, p_secret text, p_other uuid, p_message bigint, p_reason text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
begin
  return public.report_message(p_id, p_secret, p_other, p_message, 'Chat', p_reason);
end $$;

-- a bug, glitch, store problem, player (by username) or anything else, with a description
create or replace function public.report_issue(p_id uuid, p_secret text, p_kind text, p_text text, p_where text default null, p_meta jsonb default null, p_player text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare r public.players; who uuid := null; t text := private.clean_text(p_text, 1500); rid bigint;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p_kind not in ('bug','glitch','player','store','other') then return json_build_object('ok', false, 'error', 'bad_kind'); end if;
  if t is null or char_length(t) < 5 then return json_build_object('ok', false, 'error', 'too_short'); end if;
  if (select count(*) from private.reports where reporter = p_id and created_at > now() - interval '1 hour') >= 10 then return json_build_object('ok', false, 'error', 'slow_down'); end if;
  if p_kind = 'player' and coalesce(trim(p_player), '') <> '' then
    select id into who from public.players where lower(name) = lower(trim(p_player)) and not deleted order by last_seen desc nulls last limit 1;
  end if;
  insert into private.reports(reporter, reported, body, reason, kind, details)
    values (p_id, coalesce(who, p_id), null, initcap(p_kind), p_kind,
            jsonb_build_object('text', t, 'where', private.clean_text(p_where, 160), 'player', private.clean_text(p_player, 40),
                               'meta', case when p_meta is null or pg_column_size(p_meta) > 3000 then null else p_meta end))
    returning id into rid;
  return json_build_object('ok', true, 'id', rid, 'found_player', who is not null);
end $$;

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
             case when r.reported = r.reporter then null else pr.name end as reported_name, r.reporter, rp.name as reporter_name, rb.name as resolved_by_name
        from private.reports r left join public.players pr on pr.id = r.reported left join public.players rp on rp.id = r.reporter
             left join public.players rb on rb.id = r.resolved_by
       where (case when coalesce(p_resolved, false) then r.resolved_at is not null else r.resolved_at is null end)
         and (coalesce(p_kind, 'all') = 'all' or r.kind = p_kind or (p_kind = 'chat' and r.kind in ('player','message')))
       order by coalesce(r.resolved_at, r.created_at) desc limit 100) x), '[]'::json));
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_secret text, p_report bigint)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null then return json_build_object('ok', false); end if;
  update private.reports set resolved_at = now(), resolved_by = p_id where id = p_report and resolved_at is null;
  return json_build_object('ok', true);
end $$;
