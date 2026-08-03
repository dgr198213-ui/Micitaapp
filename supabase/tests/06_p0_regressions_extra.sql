-- Regression coverage for P0 fixes that shipped in 0011 without an automated test
-- (brief "Correcciones pendientes de la auditoría", block 1.2): V-07, V-07b, V-10.
begin;
select plan(6);
reset role;

-- ---------------------------------------------------------------------------
-- V-10 — availability range capped at 62 days in SQL (31 days is enforced one layer up,
-- in the Zod schema — see tests/unit/availability-range.test.ts).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      null, current_date, current_date + 90
    )$$,
  '22023', null,
  'V-10: a 90-day availability window is rejected by get_available_slots'
);

select lives_ok(
  $$select * from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      null, current_date, current_date + 62
    )$$,
  'V-10: a 62-day availability window is accepted'
);

-- ---------------------------------------------------------------------------
-- V-07 — an idempotent replay must never hand back the plaintext manage token, and the
-- cached response body must never have stored one in the first place.
-- ---------------------------------------------------------------------------
create temp table probe_day_v07 as
select dd::date as workday
from generate_series(current_date + 7, current_date + 13, interval '1 day') g(dd)
where extract(dow from dd) between 2 and 6
limit 1;

select create_public_booking(
  'barberia-lujan', '10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000101',
  ((select workday from probe_day_v07) + time '11:00') at time zone 'Europe/Madrid',
  'Cliente Idempotencia', 'idem-v07@example.com', null, null, false,
  'test-idem-key-v07', 'request-hash-v07'
);

select is(
  (
    select manage_token from create_public_booking(
      'barberia-lujan', '10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000101',
      ((select workday from probe_day_v07) + time '11:00') at time zone 'Europe/Madrid',
      'Cliente Idempotencia', 'idem-v07@example.com', null, null, false,
      'test-idem-key-v07', 'request-hash-v07'
    )
  ),
  null,
  'V-07: replaying the same Idempotency-Key returns a null manage_token'
);

select is(
  (select response_body ? 'manage_token' from idempotency_keys where key = 'test-idem-key-v07'),
  false,
  'V-07: the cached idempotency response never stored a plaintext manage_token'
);

-- ---------------------------------------------------------------------------
-- V-07b — the outbox payload's manage token is cleared once the email is sent, so it does
-- not sit in notification_jobs indefinitely.
-- ---------------------------------------------------------------------------
insert into customers (id, business_id, name, email)
values ('66666666-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cliente Notif V07b', 'v07b@example.com');
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '66666666-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
  '66666666-0000-0000-0000-000000000001', now() + interval '4 days', now() + interval '4 days 30 minutes',
  'confirmed', 30, 1500
);
insert into notification_jobs (id, business_id, appointment_id, channel, template, payload, scheduled_for, idempotency_key)
values (
  '66666666-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002',
  'email', 'confirmation', jsonb_build_object('appointmentId', '66666666-0000-0000-0000-000000000002', 'manageToken', 'plaintext-secret'),
  now(), 'test:v07b'
);

select ok(
  (select payload ? 'manageToken' from notification_jobs where id = '66666666-0000-0000-0000-000000000003'),
  'sanity check: the job payload does contain manageToken before it is sent'
);

select mark_notification_sent('66666666-0000-0000-0000-000000000003');

select is(
  (select payload ? 'manageToken' from notification_jobs where id = '66666666-0000-0000-0000-000000000003'),
  false,
  'V-07b: mark_notification_sent strips manageToken from the outbox payload'
);

select * from finish();
rollback;
