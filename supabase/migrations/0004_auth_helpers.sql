-- Role-resolution helpers used by RLS policies. SECURITY DEFINER + fixed search_path
-- (OWASP A03) so they can read `memberships` regardless of the caller's own RLS grants,
-- which avoids recursive-policy evaluation on the memberships table itself.

create or replace function auth_business_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from memberships m
  where m.business_id = p_business_id
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function auth_staff_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.staff_id
  from memberships m
  where m.business_id = p_business_id
    and m.user_id = auth.uid()
  limit 1
$$;

create or replace function auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.role = 'platform_admin'
  )
$$;

revoke all on function auth_business_role(uuid) from public;
revoke all on function auth_staff_id(uuid) from public;
revoke all on function auth_is_platform_admin() from public;
grant execute on function auth_business_role(uuid) to authenticated, anon;
grant execute on function auth_staff_id(uuid) to authenticated, anon;
grant execute on function auth_is_platform_admin() to authenticated, anon;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger appointments_set_updated_at
  before update on appointments
  for each row execute function set_updated_at();
