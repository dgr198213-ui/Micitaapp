-- Scheduled maintenance jobs (§11.3), each callable via RPC from the cron route handlers
-- with the service_role key. SECURITY DEFINER + explicit service_role-only grant so these
-- bulk status transitions can never be triggered by an ordinary authenticated session.

-- RN-07: a pending booking that never got auto-confirmed (booking_policy.auto_confirm =
-- false) expires after booking_policy.pending_expiry_minutes, freeing the slot.
create or replace function expire_pending_appointments()
returns int
language sql
security definer
set search_path = public
as $$
  with expired as (
    update appointments a
    set status = 'expired'
    from businesses b
    where a.business_id = b.id
      and a.status = 'pending'
      and a.created_at < now() - make_interval(mins => coalesce((b.booking_policy->>'pending_expiry_minutes')::int, 10))
    returning a.id
  )
  select count(*)::int from expired;
$$;

-- §11.3: a confirmed appointment more than 2h past its end with nobody having closed it
-- out (completed/no_show) is flagged as a no-show. The architecture doc calls this a
-- "suggestion" — there is no separate suggested/confirmed distinction in this schema, so
-- this transitions status directly to 'no_show' (a valid edge in the documented state
-- machine, §4.4). An owner who disagrees can still see it in appointment_events and revert.
create or replace function mark_stale_confirmed_as_no_show()
returns int
language sql
security definer
set search_path = public
as $$
  with flagged as (
    update appointments
    set status = 'no_show'
    where status = 'confirmed' and ends_at < now() - interval '2 hours'
    returning id
  )
  select count(*)::int from flagged;
$$;

revoke all on function expire_pending_appointments() from public;
revoke all on function mark_stale_confirmed_as_no_show() from public;
grant execute on function expire_pending_appointments() to service_role;
grant execute on function mark_stale_confirmed_as_no_show() to service_role;
