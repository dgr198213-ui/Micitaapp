-- V-28 (surfaced by broadening beyond the beauty/wellness vertical): a working_hours row
-- can now represent a shift crossing midnight in a SINGLE row (e.g. weekday=Monday,
-- start_local=22:00, end_local=06:00 means "Monday night through Tuesday morning").
-- end_local <= start_local is the wrap signal; the old CHECK forbade it outright.
--
-- Both is_slot_bookable and get_available_slots now consider, for a given candidate local
-- timestamp, the window opened by TODAY's row (weekday = v_weekday) and, if that row wraps,
-- also the window opened by YESTERDAY's row (weekday = v_weekday - 1) — a wrap row's window
-- extends past midnight into today. A same-day (non-wrap) row from yesterday can never reach
-- into today, so including it in the check is harmless: its computed window_end still lands
-- before today's midnight and simply never matches.

alter table working_hours drop constraint working_hours_check;
-- No upper bound beyond 24h in a single row: a shift longer than 24h needs two rows, same
-- as before. end_local = start_local (zero-length) stays rejected — that's not a valid shift.
alter table working_hours add constraint working_hours_check check (end_local <> start_local);

create or replace function is_slot_bookable(
  p_business_id uuid,
  p_staff_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_exclude_appointment_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_service services%rowtype;
  v_reserved_minutes int;
  v_min_lead interval;
  v_max_lead interval;
  v_ends_at timestamptz;
  v_weekday int;
  v_local_ts timestamp;
  v_within_hours boolean;
begin
  select * into v_business from businesses where id = p_business_id and active;
  if not found then return false; end if;

  select * into v_service from services where id = p_service_id and business_id = p_business_id and active;
  if not found then return false; end if;

  if not exists (
    select 1 from staff_services ss
    join staff s on s.id = ss.staff_id
    where ss.staff_id = p_staff_id and ss.service_id = p_service_id
      and s.business_id = p_business_id and s.active
  ) then
    return false;
  end if;

  v_reserved_minutes := v_service.duration_minutes + v_service.buffer_after_minutes;
  v_ends_at := p_starts_at + make_interval(mins => v_reserved_minutes);
  v_min_lead := make_interval(mins => coalesce((v_business.booking_policy->>'min_lead_minutes')::int, 0));
  v_max_lead := make_interval(days => coalesce((v_business.booking_policy->>'max_lead_days')::int, 60));

  if p_starts_at < now() + v_min_lead or p_starts_at > now() + v_max_lead then
    return false;
  end if;

  v_local_ts := p_starts_at at time zone v_business.timezone;
  v_weekday := extract(dow from v_local_ts)::int;

  select exists (
    select 1
    from working_hours wh
    cross join lateral (
      select case when wh.weekday = v_weekday then v_local_ts::date else v_local_ts::date - 1 end as anchor
    ) a
    where wh.staff_id = p_staff_id
      and wh.weekday in (v_weekday, (v_weekday + 6) % 7)
      and v_local_ts >= (a.anchor + wh.start_local)
      and (v_local_ts + make_interval(mins => v_reserved_minutes)) <= (
        a.anchor + wh.start_local +
        case when wh.end_local > wh.start_local
             then (wh.end_local - wh.start_local)
             else (interval '24 hours' - (wh.start_local - time '00:00:00')) + (wh.end_local - time '00:00:00')
        end
      )
  ) into v_within_hours;

  if not v_within_hours then
    return false;
  end if;

  if exists (
    select 1 from time_off t
    where t.staff_id = p_staff_id
      and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    return false;
  end if;

  if exists (
    select 1 from appointments a
    where a.staff_id = p_staff_id
      and a.status in ('pending', 'confirmed')
      and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function is_slot_bookable(uuid, uuid, uuid, timestamptz, uuid) from public;
grant execute on function is_slot_bookable(uuid, uuid, uuid, timestamptz, uuid) to anon, authenticated;

create or replace function get_available_slots(
  p_business_id uuid,
  p_service_id uuid,
  p_staff_id uuid default null,
  p_from date default current_date,
  p_to date default current_date + 14
)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_service services%rowtype;
  v_reserved_minutes int;
  v_min_lead interval;
  v_max_lead interval;
  v_step interval;
  v_now timestamptz := now();
  v_day date;
  v_staff record;
  v_wh record;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_slot_start timestamptz;
  v_slot_reserved_end timestamptz;
begin
  if p_to < p_from or p_to > p_from + interval '62 days' then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;

  select * into v_business from businesses where id = p_business_id and active;
  if not found then
    return;
  end if;

  select * into v_service from services where id = p_service_id and business_id = p_business_id and active;
  if not found then
    return;
  end if;

  v_reserved_minutes := v_service.duration_minutes + v_service.buffer_after_minutes;
  v_min_lead := make_interval(mins => coalesce((v_business.booking_policy->>'min_lead_minutes')::int, 0));
  v_max_lead := make_interval(days => coalesce((v_business.booking_policy->>'max_lead_days')::int, 60));
  v_step := make_interval(mins => greatest(coalesce((v_business.booking_policy->>'slot_interval_minutes')::int, 15), 5));

  for v_staff in
    select s.id from staff s
    join staff_services ss on ss.staff_id = s.id and ss.business_id = s.business_id
    where s.business_id = p_business_id and s.active and ss.service_id = p_service_id
      and (p_staff_id is null or s.id = p_staff_id)
  loop
    -- p_from - 1: a wrap-shift row dated the day BEFORE p_from can still open a window that
    -- extends into p_from's early morning (V-28). One extra day scanned, filtered out below
    -- by the v_now / lead-time checks same as any other slot.
    for v_day in select generate_series(p_from - 1, p_to, interval '1 day')::date loop
      for v_wh in
        select wh.start_local, wh.end_local
        from working_hours wh
        where wh.staff_id = v_staff.id and wh.weekday = extract(dow from v_day)::int
      loop
        v_window_start := (v_day + v_wh.start_local) at time zone v_business.timezone;
        -- Wrap: end_local <= start_local means the shift closes on the FOLLOWING calendar
        -- day (e.g. weekday=Monday, 22:00-06:00 covers Monday night through Tuesday morning
        -- in one row — see V-28).
        v_window_end := (
          (case when v_wh.end_local > v_wh.start_local then v_day else v_day + 1 end) + v_wh.end_local
        ) at time zone v_business.timezone;
        v_slot_start := v_window_start;

        while v_slot_start + make_interval(mins => v_reserved_minutes) <= v_window_end loop
          v_slot_reserved_end := v_slot_start + make_interval(mins => v_reserved_minutes);

          if v_slot_start >= (p_from::timestamp at time zone v_business.timezone)
             and v_slot_start >= v_now + v_min_lead
             and v_slot_start <= v_now + v_max_lead
             and not exists (
               select 1 from time_off t
               where t.staff_id = v_staff.id
                 and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(v_slot_start, v_slot_reserved_end, '[)')
             )
             and not exists (
               select 1 from appointments a
               where a.staff_id = v_staff.id
                 and a.status in ('pending', 'confirmed')
                 and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_slot_start, v_slot_reserved_end, '[)')
             )
          then
            staff_id := v_staff.id;
            starts_at := v_slot_start;
            ends_at := v_slot_start + make_interval(mins => v_service.duration_minutes);
            return next;
          end if;

          v_slot_start := v_slot_start + v_step;
        end loop;
      end loop;
    end loop;
  end loop;

  return;
end;
$$;

revoke all on function get_available_slots(uuid, uuid, uuid, date, date) from public;
grant execute on function get_available_slots(uuid, uuid, uuid, date, date) to anon, authenticated;
