-- V-28 (surfaced by broadening beyond the beauty/wellness vertical): a single working_hours
-- row can now represent a shift crossing midnight (end_local <= start_local).
begin;
select plan(6);
reset role;

insert into staff (id, business_id, display_name, active)
values ('88888888-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Turno Noche', true);
insert into staff_services (business_id, staff_id, service_id)
values ('20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000201');
-- Monday 22:00 -> Tuesday 06:00, as ONE row (the old schema forbade this outright).
insert into working_hours (business_id, staff_id, weekday, start_local, end_local)
values ('20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 1, '22:00', '06:00');

create temp table next_monday as
select (current_date + ((1 - extract(dow from current_date)::int + 7) % 7) + 7)::date as d;

select ok(
  is_slot_bookable(
    '20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000201',
    ((select d from next_monday) + time '23:30') at time zone 'Europe/Madrid'
  ),
  'V-28: a slot straddling midnight (23:30, 30min service ending 00:00) is bookable'
);

select ok(
  is_slot_bookable(
    '20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000201',
    ((select d from next_monday) + 1 + time '02:00') at time zone 'Europe/Madrid'
  ),
  'V-28: a slot in the early-morning tail of the overnight shift (02:00 Tuesday) is bookable'
);

select ok(
  not is_slot_bookable(
    '20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000201',
    ((select d from next_monday) + time '21:00') at time zone 'Europe/Madrid'
  ),
  'positive control: 21:00, before the shift starts, is still rejected'
);

select ok(
  not is_slot_bookable(
    '20000000-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000201',
    ((select d from next_monday) + 1 + time '07:00') at time zone 'Europe/Madrid'
  ),
  'positive control: 07:00 Tuesday, after the shift ends, is still rejected'
);

select is(
  (select count(*)::int from next_monday, lateral get_available_slots(
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000201',
    '88888888-0000-0000-0000-000000000001', next_monday.d, next_monday.d + 1
  ) s where (s.starts_at at time zone 'Europe/Madrid')::date = next_monday.d + 1
        and s.starts_at < (next_monday.d + 1 + time '06:00') at time zone 'Europe/Madrid'),
  21,
  'V-28: get_available_slots offers slots into Tuesday morning, not just up to midnight'
);

select is(
  (select count(*)::int from next_monday, lateral get_available_slots(
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000201',
    '88888888-0000-0000-0000-000000000001', next_monday.d, next_monday.d + 1
  ) s where s.starts_at < (next_monday.d::timestamp at time zone 'Europe/Madrid')),
  0,
  'V-28: scanning the day before p_from for wrap continuations never leaks a slot dated before p_from'
);

select * from finish();
rollback;
