-- V-14: the cron must never silently mark things 'no_show', must leave an audit trail for
-- every mass transition, and a manually-closed appointment must never be touched again.
begin;
select plan(9);
reset role;

insert into customers (id, business_id, name, email) values
  ('55555555-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cliente Stale', 'stale@example.com'),
  ('55555555-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cliente Ya Cerrado', 'cerrado@example.com'),
  ('55555555-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Cliente Reciente', 'reciente@example.com');

-- A confirmed appointment that ended 3h ago: the cron should auto-complete it.
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '55555555-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
  '55555555-0000-0000-0000-000000000001', now() - interval '3 hours 30 minutes', now() - interval '3 hours', 'confirmed', 30, 1500
);

-- An appointment already closed 'completed' long ago: must never be touched again.
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '55555555-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
  '55555555-0000-0000-0000-000000000002', now() - interval '10 days', now() - interval '10 days' + interval '30 minutes', 'completed', 30, 1500
);

-- A confirmed appointment that ended only 30 minutes ago: still inside the 2h grace window.
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '55555555-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
  '55555555-0000-0000-0000-000000000003', now() - interval '1 hour', now() - interval '30 minutes', 'confirmed', 30, 1500
);

select auto_complete_stale_appointments();

select is(
  (select status from appointments where id = '55555555-0000-0000-0000-000000000010'),
  'completed',
  'V-14: a stale confirmed appointment is auto-closed as completed, never no_show'
);

select isnt_empty(
  $$select 1 from appointment_events
    where appointment_id = '55555555-0000-0000-0000-000000000010'
      and event = 'auto_completed' and actor = 'system'$$,
  'V-14: the auto-completion leaves an appointment_events row with actor = system'
);

select is(
  (select status from appointments where id = '55555555-0000-0000-0000-000000000011'),
  'completed',
  'V-14: an appointment already closed completed is left alone by a second cron run'
);

select is(
  (select count(*)::int from appointment_events where appointment_id = '55555555-0000-0000-0000-000000000011'),
  0,
  'V-14: no new event is written for an appointment the cron did not touch'
);

select is(
  (select status from appointments where id = '55555555-0000-0000-0000-000000000012'),
  'confirmed',
  'V-14: an appointment still inside the 2h grace window is not closed yet'
);

-- expire_pending_appointments must also leave a trace now.
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents, created_at)
values (
  '55555555-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000202',
  '55555555-0000-0000-0000-000000000003', now() + interval '5 days', now() + interval '5 days 45 minutes', 'pending', 45, 2200,
  now() - interval '1 hour'
);
select expire_pending_appointments();

select is(
  (select status from appointments where id = '55555555-0000-0000-0000-000000000013'),
  'expired',
  'expire_pending_appointments still expires a stale pending booking'
);
select isnt_empty(
  $$select 1 from appointment_events
    where appointment_id = '55555555-0000-0000-0000-000000000013' and event = 'expired' and actor = 'system'$$,
  'V-14: expire_pending_appointments now leaves an appointment_events row too'
);

-- close_appointment_manually: the owner can close a confirmed appointment, and the real
-- actor_user_id is recorded (not a value the client could shape).
insert into customers (id, business_id, name, email)
values ('55555555-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Cliente Salón', 'salon@example.com');

insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '55555555-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000201',
  '55555555-0000-0000-0000-000000000004',
  now() - interval '1 day', now() - interval '1 day' + interval '45 minutes', 'confirmed', 45, 2500
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true); -- owner of Salón María
set local role authenticated;
select close_appointment_manually('55555555-0000-0000-0000-000000000014', 'no_show');
reset role;

select is(
  (select status from appointments where id = '55555555-0000-0000-0000-000000000014'),
  'no_show',
  'close_appointment_manually: the owner can manually mark a confirmed appointment as no_show'
);

select is(
  (select actor_user_id from appointment_events where appointment_id = '55555555-0000-0000-0000-000000000014' and event = 'no_show'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'close_appointment_manually: the event records the real signed-in actor_user_id'
);

select * from finish();
rollback;
