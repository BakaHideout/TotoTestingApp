-- TotoQuest v101: the owner can set any trainer's level from the Staff Panel (1-50).
-- Delivered through the gift pickup like a take-back: stored as kind 'gems' with op 'level'
-- (the gifts table only allows its original kinds) and reported to the game as kind 'set_level'.
create or replace function public.gifts_pending(p_id uuid, p_secret text)
returns json language plpgsql stable security definer set search_path = public, private, extensions as $$
declare r public.players;
begin
  r := private.me(p_id, p_secret); if r.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'gifts', coalesce((select json_agg(x order by x.id) from (
    select g.id, case when g.op = 'take' then 'take_' || g.kind when g.op in ('trade','trade_back') then g.op when g.op = 'level' then 'set_level' else g.kind end as kind,
           g.amount, g.toto, g.note, g.created_at from private.gifts g
     where g.player_id = p_id and g.claimed_at is null order by g.id limit 50) x), '[]'::json));
end $$;

create or replace function public.admin_set_level(p_id uuid, p_secret text, p_target uuid, p_level integer, p_note text default null)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare a public.players; t public.players; n integer; gid bigint;
begin
  a := private.admin_me(p_id, p_secret); if a.id is null or not a.is_owner then return json_build_object('ok', false, 'error', 'owner_only'); end if;
  select * into t from public.players where id = p_target;
  if not found or t.deleted then return json_build_object('ok', false, 'error', 'not_found'); end if;
  n := least(greatest(coalesce(p_level, 1), 1), 50);
  insert into private.gifts(player_id, kind, op, amount, toto, note, created_by)
    values (p_target, 'gems', 'level', n, null, nullif(left(regexp_replace(trim(coalesce(p_note, '')), '[[:cntrl:]<>]', '', 'g'), 140), ''), p_id)
    returning id into gid;
  update public.players set level = n where id = p_target;
  return json_build_object('ok', true, 'id', gid, 'level', n, 'online', private.is_online(t.last_seen));
end $$;
