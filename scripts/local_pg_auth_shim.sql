-- DEV/TEST-ONLY shim. A real Supabase project already provides the `auth` schema,
-- the anon/authenticated/service_role roles and auth.uid(). This file recreates just
-- enough of that surface to run the migrations and pgTAP suite against a plain local
-- Postgres install in environments where the Supabase CLI's Docker stack is unavailable.
-- Never apply this to a Supabase-managed database.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;
