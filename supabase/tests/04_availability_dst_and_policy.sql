-- T-02: DST transitions (Spain: last Sunday of March/October) must not shift a local
-- working-hours window in UTC. RN-04: lead-time policy is enforced by get_available_slots.
begin;
select plan(4);
reset role;

-- Temporary Sunday working hours for the barbería's only staff member, just for this test.
insert into working_hours (business_id, staff_id, weekday, start_local, end_local)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', 0, '09:00', '11:00');

-- The DST fixture dates are fixed in the calendar (2026), independent of when the suite
-- runs, so the lead-time policy must be widened enough to not exclude them either way.
update businesses set booking_policy = jsonb_set(jsonb_set(booking_policy, '{min_lead_minutes}', '0'), '{max_lead_days}', '3650')
where id = '10000000-0000-0000-0000-000000000001';

-- 2026-10-18: still CEST (UTC+2) in Spain -> 09:00 local = 07:00 UTC.
select ok(
  exists(
    select 1 from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000101', '2026-10-18', '2026-10-18'
    ) where starts_at = '2026-10-18 07:00:00+00'
  ),
  'pre-DST-change Sunday: 09:00 local (CEST, UTC+2) resolves to 07:00 UTC'
);

-- 2026-10-25: clocks went back overnight -> CET (UTC+1) -> 09:00 local = 08:00 UTC.
select ok(
  exists(
    select 1 from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000101', '2026-10-25', '2026-10-25'
    ) where starts_at = '2026-10-25 08:00:00+00'
  ),
  'post-DST-change Sunday: 09:00 local (CET, UTC+1) resolves to 08:00 UTC'
);

-- RN-04: an effectively-infinite minimum lead time must suppress every slot, even though
-- the working-hours grid itself is untouched. A 3-day window always contains at least one
-- of the barbería's Tue-Sat working days, so this is robust to whatever day the suite runs on.
update businesses set booking_policy = jsonb_set(booking_policy, '{min_lead_minutes}', '999999999')
where id = '10000000-0000-0000-0000-000000000001';

select is_empty(
  $$select * from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000101', current_date, current_date + 3
    )$$,
  'no slot is offered while it falls inside the minimum-lead-time window (RN-04)'
);

update businesses set booking_policy = jsonb_set(booking_policy, '{min_lead_minutes}', '0')
where id = '10000000-0000-0000-0000-000000000001';

select isnt_empty(
  $$select * from get_available_slots(
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000101', current_date, current_date + 3
    )$$,
  'slots reappear once the lead-time restriction is lifted'
);

select * from finish();
rollback;
