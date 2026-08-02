-- ADR-003 condition #2: every business table has RLS active. This is the generic,
-- table-agnostic guardrail that must stay green even as new tables are added.
begin;
select plan(1);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'businesses', 'business_hours', 'memberships', 'staff', 'services', 'staff_services',
        'working_hours', 'time_off', 'customers', 'appointments', 'appointment_events',
        'notification_jobs', 'idempotency_keys'
      )
  ),
  'RLS is enabled on every business table'
);

select * from finish();
rollback;
