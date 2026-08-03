-- V-13: appointment_events can only be written through log_appointment_event(), which
-- derives the actor from the caller's real membership — never a client-supplied value.
begin;
select plan(6);
reset role;

insert into customers (id, business_id, name, email)
values ('44444444-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cliente Audit', 'audit@example.com');
insert into appointments (id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status, duration_minutes, price_cents)
values (
  '44444444-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
  '44444444-0000-0000-0000-000000000001', now() + interval '6 days', now() + interval '6 days 30 minutes',
  'confirmed', 30, 1500
);

-- The barbería's owner account also happens to be its only staff-linked membership? No —
-- seed only gives it an owner. Use the owner for the "legitimate write" case.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true); -- barbería owner
set local role authenticated;

select throws_ok(
  $$insert into appointment_events (appointment_id, business_id, event, actor)
    values ('44444444-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'forged', 'owner')$$,
  '42501', null,
  'V-13: a direct INSERT into appointment_events from authenticated is rejected outright'
);

select lives_ok(
  $$select log_appointment_event('44444444-0000-0000-0000-000000000002', 'note_added', '{"via":"test"}'::jsonb)$$,
  'V-13: log_appointment_event() succeeds for a legitimate member'
);

reset role;

select is(
  (select actor from appointment_events where appointment_id = '44444444-0000-0000-0000-000000000002' and event = 'note_added'),
  'owner',
  'V-13: the recorded actor role matches the real caller''s membership, not a declared value'
);

select is(
  (select actor_user_id from appointment_events where appointment_id = '44444444-0000-0000-0000-000000000002' and event = 'note_added'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'V-13: actor_user_id is the real auth.uid() of the caller'
);

-- A user with no membership on this business cannot log an event for it either.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true); -- Salón María's owner, unrelated business
set local role authenticated;

select throws_ok(
  $$select log_appointment_event('44444444-0000-0000-0000-000000000002', 'forged_by_outsider', '{}'::jsonb)$$,
  'P0001', null,
  'V-13: a user with no membership on the appointment''s business cannot log an event for it'
);

reset role;
select is(
  (select count(*)::int from appointment_events where event = 'forged_by_outsider'),
  0,
  'V-13: the rejected outsider attempt left no trace'
);

select * from finish();
rollback;
