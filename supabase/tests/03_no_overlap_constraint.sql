-- T-01 (the requirement of the product): the exclusion constraint, not application code,
-- makes double-booking impossible. T-03: range arithmetic must stay correct when an
-- appointment crosses midnight. RN-05: a cancelled appointment frees its slot immediately.
begin;
select plan(6);
reset role;

insert into customers (id, business_id, name) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cliente Uno'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cliente Dos');

-- T-01: first booking succeeds, an overlapping one on the same staff is rejected.
select lives_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
      '50000000-0000-0000-0000-000000000001', '2027-01-05 10:00+00', '2027-01-05 10:35+00',
      'confirmed', 30, 5, 1500
    )$$,
  'first booking on a free slot succeeds'
);

select throws_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
      '50000000-0000-0000-0000-000000000002', '2027-01-05 10:15+00', '2027-01-05 10:50+00',
      'confirmed', 30, 5, 1500
    )$$,
  '23P01', NULL,
  'overlapping booking on the same staff is rejected by the exclusion constraint'
);

-- RN-05: cancelling frees the slot immediately for a new booking.
update appointments set status = 'cancelled_by_client' where id = '50000000-0000-0000-0000-000000000010';

select lives_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
      '50000000-0000-0000-0000-000000000002', '2027-01-05 10:00+00', '2027-01-05 10:35+00',
      'confirmed', 30, 5, 1500
    )$$,
  'a cancelled appointment no longer blocks its slot (RN-05)'
);

-- T-03: an appointment crossing midnight is still handled correctly by tstzrange overlap.
select lives_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000202',
      '50000000-0000-0000-0000-000000000001', '2027-01-06 23:30+00', '2027-01-07 00:30+00',
      'confirmed', 45, 10, 2200
    )$$,
  'an appointment crossing midnight is accepted'
);

select throws_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
      '50000000-0000-0000-0000-000000000002', '2027-01-07 00:00+00', '2027-01-07 00:35+00',
      'confirmed', 30, 5, 1500
    )$$,
  '23P01', NULL,
  'a slot overlapping the midnight-crossing appointment on the following day is rejected'
);

select lives_ok(
  $$insert into appointments (
      id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      duration_minutes, buffer_after_minutes, price_cents
    ) values (
      '50000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000201',
      '50000000-0000-0000-0000-000000000002', '2027-01-07 00:30+00', '2027-01-07 01:05+00',
      'confirmed', 30, 5, 1500
    )$$,
  'a slot immediately after the midnight-crossing appointment ends is accepted'
);

select * from finish();
rollback;
