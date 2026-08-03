-- ============================================================================
-- V-14 — the no-show cron was corrupting the historical record and the no-show KPI.
--
-- Problem: mark_stale_confirmed_as_no_show() moved EVERY confirmed appointment more than
-- 2h past its end straight to 'no_show', platform-wide, with no audit trail. Nothing in
-- the product closes an appointment as 'completed', so in practice almost every finished
-- appointment would end up marked 'no_show' — the metric that's supposed to measure real
-- no-shows would be lying from day one, and a client's history would say they never once
-- showed up.
--
-- Decision (Dani, 2026-08-03, option A of three offered): the cron closes stale confirmed
-- appointments as 'completed' by default. 'no_show' becomes an exclusively manual action
-- the business takes from the agenda panel — see close_appointment_manually() below and
-- the new UI in src/app/app/agenda.
--
-- Every mass transition this migration performs (auto-completion here, and expiry in
-- expire_pending_appointments, which had the same silent-transition gap) now writes an
-- appointment_events row with actor = 'system', per the brief's explicit requirement
-- regardless of which closure option got picked.
--
-- mark_stale_confirmed_as_no_show() is deliberately left in place, unmodified, but no
-- longer called by the application (the cron route now calls auto_complete_stale_
-- appointments instead) — dropping a function isn't covered by the expand-only rule
-- (which is about columns/tables), but removing the only thing that could resurrect this
-- bug is safer than leaving a live footgun with service_role execute rights.
-- ============================================================================

create or replace function auto_complete_stale_appointments()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
begin
  select array_agg(id) into v_ids
  from appointments
  where status = 'confirmed' and ends_at < now() - interval '2 hours';

  if v_ids is null then
    return 0;
  end if;

  update appointments set status = 'completed' where id = any(v_ids);

  insert into appointment_events (appointment_id, business_id, event, actor, metadata)
  select a.id, a.business_id, 'auto_completed', 'system', jsonb_build_object('reason', 'stale_confirmed_2h')
  from appointments a
  where a.id = any(v_ids);

  select array_length(v_ids, 1) into v_count;
  return v_count;
end;
$$;

revoke all on function auto_complete_stale_appointments() from public;
grant execute on function auto_complete_stale_appointments() to service_role;

-- Same gap as V-14, same fix: expiring a pending booking is also a mass, unattended
-- transition and previously left no trace in appointment_events.
create or replace function expire_pending_appointments()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
begin
  select array_agg(a.id) into v_ids
  from appointments a
  join businesses b on b.id = a.business_id
  where a.status = 'pending'
    and a.created_at < now() - make_interval(mins => coalesce((b.booking_policy->>'pending_expiry_minutes')::int, 10));

  if v_ids is null then
    return 0;
  end if;

  update appointments set status = 'expired' where id = any(v_ids);

  insert into appointment_events (appointment_id, business_id, event, actor)
  select a.id, a.business_id, 'expired', 'system'
  from appointments a
  where a.id = any(v_ids);

  select array_length(v_ids, 1) into v_count;
  return v_count;
end;
$$;

revoke all on function expire_pending_appointments() from public;
grant execute on function expire_pending_appointments() to service_role;

-- Manual closure (completed/no_show) from the agenda panel. A deliberate business action,
-- never automatic. Only a confirmed appointment can be closed this way.
create or replace function close_appointment_manually(p_appointment_id uuid, p_status text)
returns setof appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_role text;
begin
  if p_status not in ('completed', 'no_show') then
    raise exception 'INVALID_STATE';
  end if;

  select business_id into v_business_id from appointments where id = p_appointment_id and status = 'confirmed';
  if v_business_id is null then
    raise exception 'INVALID_STATE';
  end if;

  v_role := auth_business_role(v_business_id);
  if v_role not in ('owner', 'staff') then
    raise exception 'FORBIDDEN';
  end if;

  update appointments set status = p_status where id = p_appointment_id;

  insert into appointment_events (appointment_id, business_id, event, actor, actor_user_id)
  values (p_appointment_id, v_business_id, p_status, v_role, auth.uid());

  return query select * from appointments where id = p_appointment_id;
end;
$$;

revoke all on function close_appointment_manually(uuid, text) from public;
grant execute on function close_appointment_manually(uuid, text) to authenticated;
