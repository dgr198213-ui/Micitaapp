-- ============================================================================
-- V-02 structural follow-up — platform_admin gets its own table.
--
-- The 0011 fix stopped a business owner from writing a platform_admin membership row, but
-- the role stayed representable inside `memberships`, and README §V-02 documents the
-- resulting leak: any member of a business can still SELECT that a platform_admin row
-- exists for their business_id via memberships_business_read, which is an unfiltered,
-- independent SELECT policy that combines with the write policy via OR. A dedicated table
-- with no RLS policy at all for `authenticated` removes that read path structurally,
-- rather than relying on a policy staying correctly written forever.
--
-- Expand-only, as instructed: this migration adds the new table and repoints
-- auth_is_platform_admin() at it, but deliberately does NOT remove 'platform_admin' from
-- memberships.role's CHECK constraint — that is a contract step for a later migration,
-- once any pre-existing platform_admin membership rows are confirmed migrated (done below)
-- and nothing still depends on the old representation.
-- ============================================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
-- Deliberately zero policies: RLS + no policy = deny-all for every role subject to RLS
-- (anon, authenticated). Only service_role (bypasses RLS) and SECURITY DEFINER functions
-- owned by the migration role (effectively superuser, also bypasses RLS) can ever read or
-- write this table. There is no read policy, let alone a write one, for `authenticated`.

-- Carry forward any platform_admin rows that already exist under the old representation.
insert into platform_admins (user_id, created_at)
select user_id, created_at from memberships where role = 'platform_admin'
on conflict (user_id) do nothing;

create or replace function auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

revoke all on function auth_is_platform_admin() from public;
grant execute on function auth_is_platform_admin() to authenticated, anon;
