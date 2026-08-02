-- Outbox worker primitives (§11.3). Vercel Cron guarantees neither exact timing nor
-- single delivery, so claiming uses FOR UPDATE SKIP LOCKED (safe under overlapping cron
-- invocations) and every job carries a unique idempotency_key so a duplicate send is
-- structurally impossible, not just unlikely.

create or replace function claim_notification_jobs(p_limit int default 25)
returns setof notification_jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id from notification_jobs
    where status = 'pending' and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
    limit p_limit
  )
  update notification_jobs n
  set attempts = attempts + 1
  from due
  where n.id = due.id
  returning n.*;
$$;

create or replace function mark_notification_sent(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_jobs set status = 'sent', sent_at = now() where id = p_id;
$$;

create or replace function mark_notification_failed(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
  v_backoff interval;
begin
  select attempts into v_attempts from notification_jobs where id = p_id;
  if v_attempts is null then
    return;
  end if;

  if v_attempts >= 4 then
    update notification_jobs set status = 'failed', last_error = p_error where id = p_id;
  else
    v_backoff := case v_attempts
      when 1 then interval '1 minute'
      when 2 then interval '5 minutes'
      else interval '30 minutes'
    end;
    update notification_jobs
    set status = 'pending', last_error = p_error, scheduled_for = now() + v_backoff
    where id = p_id;
  end if;
end;
$$;

revoke all on function claim_notification_jobs(int) from public;
revoke all on function mark_notification_sent(uuid) from public;
revoke all on function mark_notification_failed(uuid, text) from public;
grant execute on function claim_notification_jobs(int) to service_role;
grant execute on function mark_notification_sent(uuid) to service_role;
grant execute on function mark_notification_failed(uuid, text) to service_role;
