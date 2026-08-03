-- ============================================================================
-- V-13 — appointment_events is not evidence if any member can insert whatever they like.
--
-- Problem: authenticated had a plain INSERT grant plus a permissive RLS policy
-- (auth_business_role(business_id) is not null) on appointment_events, and every call site
-- passed `actor` as a client-supplied string. Nothing stopped a compromised or careless
-- client from writing `actor: 'owner'` while signed in as staff, or backdating/fabricating
-- an event entirely. The trail the design uses as its repudiation mitigation (§8.1) was not
-- proof of anything.
--
-- Fix: the only way to write an audit event is log_appointment_event(), a SECURITY DEFINER
-- function that derives the actor's role from auth_business_role() and stamps
-- actor_user_id = auth.uid() itself — never a value the caller provides. Direct INSERT is
-- revoked from authenticated entirely.
-- ============================================================================

create or replace function log_appointment_event(
  p_appointment_id uuid,
  p_event text,
  p_metadata jsonb default '{}'::jsonb
)
returns appointment_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_role text;
  v_row appointment_events;
begin
  select business_id into v_business_id from appointments where id = p_appointment_id;
  if v_business_id is null then
    raise exception 'INVALID_STATE';
  end if;

  v_role := auth_business_role(v_business_id);
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  insert into appointment_events (appointment_id, business_id, event, actor, actor_user_id, metadata)
  values (p_appointment_id, v_business_id, p_event, v_role, auth.uid(), p_metadata)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function log_appointment_event(uuid, text, jsonb) from public;
grant execute on function log_appointment_event(uuid, text, jsonb) to authenticated;

drop policy if exists appointment_events_member_insert on appointment_events;
revoke insert on appointment_events from authenticated;
-- select stays granted (0009) and appointment_events_member_read (0005) still applies —
-- members can still read the trail, just never write to it directly.
