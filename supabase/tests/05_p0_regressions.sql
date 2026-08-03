-- Regression suite for the P0 findings of the 2026-08-03 audit. Every assertion here
-- corresponds to an exploit that was reproduced against this seed data BEFORE the fix in
-- migration 0011 — these are not hypothetical.
begin;
select plan(10);
reset role;

-- A working day for Barbería Luján (Tue-Sat 10:00-20:00), far enough out to clear the
-- 60-minute minimum lead time and well inside max_lead_days = 45.
create temp table probe_day as
select dd::date as workday
from generate_series(current_date + 7, current_date + 13, interval '1 day') g(dd)
where extract(dow from dd) between 2 and 6
limit 1;

-- The V-09 assertion calls the public RPC as `anon`, which still needs to read the fixture.
grant select on probe_day to anon;

-- ---------------------------------------------------------------------------
-- V-01 — cross-tenant agenda poisoning
-- ---------------------------------------------------------------------------
insert into customers (id, business_id, name, email)
values ('99999999-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cliente Atacante', 'atk@example.com');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true); -- owner of Salón María
set local role authenticated;

select throws_ok(
  $$insert into appointments (business_id, staff_id, service_id, customer_id, starts_at, ends_at,
                              status, duration_minutes, price_cents)
    values ('20000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000101',  -- another tenant's staff member
            '20000000-0000-0000-0000-000000000201',
            '99999999-0000-0000-0000-000000000001',
            '2026-09-15 08:00:00+00', '2026-09-15 18:00:00+00', 'confirmed', 600, 0)$$,
  '23503',
  null,
  'V-01: a tenant cannot book against another tenant''s staff member'
);

select throws_ok(
  $$insert into appointments (business_id, staff_id, service_id, customer_id, starts_at, ends_at,
                              status, duration_minutes, price_cents)
    values ('20000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000101',
            '10000000-0000-0000-0000-000000000201',  -- another tenant's service
            '99999999-0000-0000-0000-000000000001',
            '2026-09-16 08:00:00+00', '2026-09-16 09:00:00+00', 'confirmed', 60, 0)$$,
  '23503',
  null,
  'V-01: a tenant cannot attach another tenant''s service to an appointment'
);

select lives_ok(
  $$insert into appointments (business_id, staff_id, service_id, customer_id, starts_at, ends_at,
                              status, duration_minutes, price_cents)
    values ('20000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000101',
            '20000000-0000-0000-0000-000000000201',
            '99999999-0000-0000-0000-000000000001',
            '2026-09-17 08:00:00+00', '2026-09-17 09:00:00+00', 'confirmed', 60, 0)$$,
  'positive control: a coherent, same-tenant appointment still inserts'
);

-- ---------------------------------------------------------------------------
-- V-02 — privilege escalation to platform_admin
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update memberships set role = 'platform_admin'
    where user_id = '00000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'V-02: a business owner cannot promote themselves to platform_admin'
);

select is(
  (select auth_business_role('20000000-0000-0000-0000-000000000001')),
  'owner',
  'V-02: the owner keeps their legitimate role after the failed escalation'
);

reset role;

-- ---------------------------------------------------------------------------
-- V-04 — booking outside working hours through modular `time` arithmetic
-- ---------------------------------------------------------------------------
select ok(
  not is_slot_bookable(
    '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000201',
    ((select workday from probe_day) + time '23:50') at time zone 'Europe/Madrid'
  ),
  'V-04: 23:50 is rejected for a business that closes at 20:00 (no midnight wrap)'
);

select ok(
  is_slot_bookable(
    '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000201',
    ((select workday from probe_day) + time '11:00') at time zone 'Europe/Madrid'
  ),
  'positive control: 11:00 on a working day is still bookable'
);

-- ---------------------------------------------------------------------------
-- V-03 — claiming must reserve the job, not just count an attempt
-- ---------------------------------------------------------------------------
insert into customers (id, business_id, name, email)
values ('99999999-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cliente Notif', 'notif@example.com');
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at,
                          status, duration_minutes, price_cents)
values ('99999999-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
        '99999999-0000-0000-0000-000000000002',
        now() + interval '5 days', now() + interval '5 days 35 minutes', 'confirmed', 30, 1500);
insert into notification_jobs (business_id, appointment_id, channel, template, payload, scheduled_for, idempotency_key)
values ('10000000-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000003',
        'email', 'confirmation', '{"manageToken":"secreto"}'::jsonb, now() - interval '1 minute',
        'test:claim-once');

select is(
  (select count(*)::int from claim_notification_jobs(25)),
  1,
  'V-03: the first worker claims the due job'
);

select is(
  (select count(*)::int from claim_notification_jobs(25)),
  0,
  'V-03: an overlapping second worker claims nothing — no duplicate send'
);

-- ---------------------------------------------------------------------------
-- V-09 — an anonymous booking must not rewrite an existing customer record
-- ---------------------------------------------------------------------------
insert into customers (id, business_id, name, email, phone)
values ('99999999-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
        'Nombre Original', 'victima@example.com', '+34600111222');

set local role anon;
select create_public_booking(
  'barberia-lujan',
  '10000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000101',
  ((select workday from probe_day) + time '12:00') at time zone 'Europe/Madrid',
  'Nombre Falsificado', 'VICTIMA@example.com', '+34699999999', null, true, null, null
);
reset role;

select results_eq(
  $$select name, phone, marketing_consent from customers
    where id = '99999999-0000-0000-0000-000000000004'$$,
  $$values ('Nombre Original'::text, '+34600111222'::text, false)$$,
  'V-09: an anonymous booking cannot overwrite name, phone or consent of an existing customer'
);

select * from finish();
rollback;
