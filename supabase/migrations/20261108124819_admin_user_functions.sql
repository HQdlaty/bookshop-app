-- Admin user management functions. The only way the app lists users (with their email) or changes roles.
-- Both are SECURITY DEFINER so they can read auth.users, and both check public.is_admin() first,
-- so the database (not the UI) decides who may call them.

-- ---------------------------------------------------------------------------
-- admin_list_users: one page of users, with the exact total number of matches.
-- Returns only the listed columns: never tokens, password hashes or raw metadata.
-- ---------------------------------------------------------------------------
create function public.admin_list_users(
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  role public.app_role,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit int;
  v_offset int;
  v_pattern text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  -- Optional search: %, _ and backslash typed by the admin are matched literally.
  v_pattern := nullif(btrim(p_search), '');
  if v_pattern is not null then
    v_pattern := '%' || replace(replace(replace(v_pattern, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    coalesce(r.role, 'user'::public.app_role),
    u.created_at,
    count(*) over ()
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  where v_pattern is null
     or u.email ilike v_pattern
     or p.display_name ilike v_pattern
  order by u.created_at desc, u.id
  limit v_limit
  offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_user_role: promote or demote another user.
-- ---------------------------------------------------------------------------
create function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null or p_role is null then
    raise exception 'user and role are required' using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'admins cannot change their own role' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only (the functions themselves then require an admin).
-- ---------------------------------------------------------------------------
revoke all on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
