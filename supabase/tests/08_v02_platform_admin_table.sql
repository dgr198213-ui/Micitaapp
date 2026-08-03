-- V-02 structural follow-up: platform_admins is a genuinely isolated table — `authenticated`
-- has no GRANT on it at all (modern Supabase doesn't auto-expose new tables, see 0009's
-- comment) and no RLS policy either, so access fails at the permission layer before RLS
-- even runs (42501 "permission denied"), stronger than an RLS-filtered empty result would
-- be. Only the SECURITY DEFINER auth_is_platform_admin() function, owned by a role that
-- bypasses both grants and RLS, can ever see this table.
begin;
select plan(6);
reset role;

insert into platform_admins (user_id) values ('00000000-0000-0000-0000-000000000003'); -- Centro Bienestar's owner, here wearing a platform_admin hat too

-- A regular owner, unrelated to the platform_admins row, cannot read the table at all.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true); -- Salón María's owner
set local role authenticated;
select throws_ok(
  $$select 1 from platform_admins$$,
  '42501', null,
  'V-02: an unrelated business owner cannot read platform_admins at all (no GRANT, no policy)'
);

select is(
  auth_is_platform_admin(),
  false,
  'V-02: auth_is_platform_admin() is false for a user who is not in platform_admins'
);

reset role;

-- Even the platform_admin themselves cannot SELECT their own row directly — only through
-- the function, which is intentionally the only door.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select throws_ok(
  $$select 1 from platform_admins$$,
  '42501', null,
  'V-02: even the platform_admin cannot read platform_admins directly, by design'
);

select is(
  auth_is_platform_admin(),
  true,
  'V-02: auth_is_platform_admin() is true for a user who IS in platform_admins'
);

-- Nobody authenticated can write to platform_admins either — no policy means the insert
-- itself is rejected by RLS, not silently a no-op.
select throws_ok(
  $$insert into platform_admins (user_id) values ('00000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'V-02: an authenticated user cannot insert into platform_admins (no policy grants it)'
);

reset role;
select is(
  (select count(*)::int from platform_admins),
  1,
  'V-02: the failed insert attempt left platform_admins with only the original seeded row'
);

select * from finish();
rollback;
