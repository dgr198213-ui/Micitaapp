-- Availability engine (ADR-004): computed on demand, never materialized. SECURITY DEFINER
-- because it must read working_hours/time_off/appointments, which anon has no direct grants
-- on (§8.1 — the public endpoint returns only slots, never customer or schedule data).
--
-- Known limitation: a working_hours row cannot itself span midnight (checked by
-- end_local > start_local), so a shift crossing midnight must be modeled as two rows
-- (e.g. weekday D 20:00-23:59:59 and weekday D+1 00:00-02:00). A slot cannot straddle two
-- separate windows. Acceptable for the beauty/wellness vertical assumed in S2.
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
  if p_to < p_from or p_to > p_from + interval '370 days' then
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
    for v_day in select generate_series(p_from, p_to, interval '1 day')::date loop
      for v_wh in
        select wh.start_local, wh.end_local
        from working_hours wh
        where wh.staff_id = v_staff.id and wh.weekday = extract(dow from v_day)::int
      loop
        v_window_start := (v_day + v_wh.start_local) at time zone v_business.timezone;
        v_window_end := (v_day + v_wh.end_local) at time zone v_business.timezone;
        v_slot_start := v_window_start;

        while v_slot_start + make_interval(mins => v_reserved_minutes) <= v_window_end loop
          v_slot_reserved_end := v_slot_start + make_interval(mins => v_reserved_minutes);

          if v_slot_start >= v_now + v_min_lead
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

-- Single-instant re-validation used by create_public_booking / reschedule so the server
-- never trusts a client-supplied `startsAt` (Tampering mitigation, §8.1).
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
  v_local_start time;
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
    where ss.staff_id = p_staff_id and ss.service_id = p_service_id and s.business_id = p_business_id and s.active
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

  -- Containment within a working_hours window, evaluated in the business's local time so
  -- DST transitions on the appointment's own date are handled correctly (RN-06).
  v_local_ts := p_starts_at at time zone v_business.timezone;
  v_weekday := extract(dow from v_local_ts)::int;
  v_local_start := v_local_ts::time;

  select exists (
    select 1 from working_hours wh
    where wh.staff_id = p_staff_id
      and wh.weekday = v_weekday
      and v_local_start >= wh.start_local
      and (v_local_start + make_interval(mins => v_reserved_minutes)) <= wh.end_local
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
