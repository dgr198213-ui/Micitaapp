-- ============================================================================
-- P0 security & correctness fixes — audit of 2026-08-03
--
-- V-01 cross-tenant agenda poisoning      (CRITICAL)  → composite foreign keys
-- V-02 privilege escalation to admin      (CRITICAL)  → membership role policy
-- V-03 duplicate notification sends       (CRITICAL)  → 'processing' claim state
-- V-04 booking outside working hours      (HIGH)      → timestamp-space comparison
-- V-07 plaintext manage token at rest     (HIGH)      → token out of the idempotency cache
-- V-09 anonymous CRM overwrite            (HIGH)      → conflict path no longer overwrites
-- V-10 availability range exhaustion      (HIGH)      → hard cap lowered 370d → 62d
-- V-22 missing retention job              (LOW)       → purge_expired_artifacts()
--
-- Expand-only: no column or table is dropped, so the previous release keeps working
-- against this schema (§9.3 expand → migrate → contract).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- V-01 — Referential coherence across tenants.
--
-- RLS answers "which tenant owns this row?". It never answers "are this row's foreign
-- keys consistent with each other?". Without that second guarantee, a legitimate owner
-- could insert an appointment into their OWN business referencing ANOTHER business's
-- staff member — passing the RLS check while the global per-staff exclusion constraint
-- blocked the victim's real agenda. Composite keys make the incoherent state
-- unrepresentable at engine level.
-- ----------------------------------------------------------------------------

alter table staff        add constraint staff_business_id_key        unique (business_id, id);
alter table services     add constraint services_business_id_key     unique (business_id, id);
alter table customers    add constraint customers_business_id_key    unique (business_id, id);
alter table appointments add constraint appointments_business_id_key unique (business_id, id);

alter table appointments drop constraint appointments_staff_id_fkey;
alter table appointments drop constraint appointments_service_id_fkey;
alter table appointments drop constraint appointments_customer_id_fkey;

alter table appointments
  add constraint appointments_staff_fk
    foreign key (business_id, staff_id) references staff (business_id, id),
  add constraint appointments_service_fk
    foreign key (business_id, service_id) references services (business_id, id),
  add constraint appointments_customer_fk
    foreign key (business_id, customer_id) references customers (business_id, id);

alter table staff_services drop constraint staff_services_staff_id_fkey;
alter table staff_services drop constraint staff_services_service_id_fkey;

alter table staff_services
  add constraint staff_services_staff_fk
    foreign key (business_id, staff_id) references staff (business_id, id) on delete cascade,
  add constraint staff_services_service_fk
    foreign key (business_id, service_id) references services (business_id, id) on delete cascade;

-- Same treatment for the two child tables that carry both keys, which closes the
-- cross-tenant audit-event injection noted as V-13. notification_jobs.appointment_id is
-- nullable (daily_digest jobs have none); MATCH SIMPLE leaves those rows unconstrained.
alter table appointment_events drop constraint appointment_events_appointment_id_fkey;
alter table appointment_events
  add constraint appointment_events_appointment_fk
    foreign key (business_id, appointment_id) references appointments (business_id, id) on delete cascade;

alter table notification_jobs drop constraint notification_jobs_appointment_id_fkey;
alter table notification_jobs
  add constraint notification_jobs_appointment_fk
    foreign key (business_id, appointment_id) references appointments (business_id, id) on delete cascade;


-- ----------------------------------------------------------------------------
-- V-02 — A tenant owner must not be able to mint a platform-wide role.
--
-- The old policy checked WHICH business you administer but not WHICH role you may write,
-- and the table's CHECK allows 'platform_admin'. One UPDATE granted read access to every
-- business plus write access to any business row (slug hijacking, deactivation).
--
-- Structural follow-up (recommended, not done here to keep this migration reversible):
-- move platform_admin to its own table with no `authenticated` write grant at all.
-- ----------------------------------------------------------------------------

drop policy memberships_owner_write on memberships;

create policy memberships_owner_write on memberships
  for all to authenticated
  using (auth_business_role(business_id) = 'owner' and role <> 'platform_admin')
  with check (auth_business_role(business_id) = 'owner' and role in ('owner', 'staff'));


-- ----------------------------------------------------------------------------
-- V-03 — Claiming a job must reserve it, not merely count an attempt.
--
-- FOR UPDATE SKIP LOCKED only holds for the duration of the claiming transaction, which
-- ends when the function returns — the HTTP send happens afterwards, with the rows still
-- 'pending'. Overlapping cron invocations (the notifications cron runs every minute over
-- a 25-job batch) therefore re-claimed and re-sent the same jobs. The unique
-- idempotency_key prevents duplicate ROWS, never duplicate SENDS.
-- ----------------------------------------------------------------------------

alter table notification_jobs add column if not exists claimed_at timestamptz;

alter table notification_jobs drop constraint notification_jobs_status_check;
alter table notification_jobs
  add constraint notification_jobs_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

-- The partial index backing the worker sweep must keep matching the claim predicate.
drop index if exists idx_notification_jobs_due;
create index idx_notification_jobs_due on notification_jobs (status, scheduled_for)
  where status in ('pending', 'processing');

create or replace function claim_notification_jobs(p_limit int default 25)
returns setof notification_jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id from notification_jobs
    where (status = 'pending' and scheduled_for <= now())
       -- Lease recovery: a worker that died mid-send leaves the job in 'processing'.
       -- After 5 minutes it becomes claimable again, so a crash costs a delay, not a loss.
       or (status = 'processing' and claimed_at < now() - interval '5 minutes')
    order by scheduled_for
    for update skip locked
    limit p_limit
  )
  update notification_jobs n
  set status = 'processing', claimed_at = now(), attempts = attempts + 1
  from due
  where n.id = due.id
  returning n.*;
$$;

-- V-07 (partial): once the email is out, the plaintext manage token has no reason to
-- remain in the outbox payload.
create or replace function mark_notification_sent(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_jobs
  set status = 'sent', sent_at = now(), payload = payload - 'manageToken'
  where id = p_id;
$$;

revoke all on function claim_notification_jobs(int) from public;
revoke all on function mark_notification_sent(uuid) from public;
grant execute on function claim_notification_jobs(int) to service_role;
grant execute on function mark_notification_sent(uuid) to service_role;


-- ----------------------------------------------------------------------------
-- V-04 — Working-hours containment must be evaluated on timestamps, not on `time`.
--
-- `time` arithmetic in Postgres wraps modulo 24h: time '23:50' + interval '35 minutes'
-- yields '00:25', which then compares as <= '20:00' and passed the check. A client-
-- supplied startsAt of 23:50 was accepted by a business closing at 20:00 — a server-side
-- validation bypass, since the public endpoint validates startsAt ONLY through this
-- function. Confirmed empirically against the seed data before this fix.
-- ----------------------------------------------------------------------------

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

  -- Containment compared in the business's local wall-clock TIMESTAMP space: no modular
  -- wrap, and a service running past midnight correctly falls outside the day's window.
  select exists (
    select 1 from working_hours wh
    where wh.staff_id = p_staff_id
      and wh.weekday = v_weekday
      and v_local_ts >= (v_local_ts::date + wh.start_local)
      and (v_local_ts + make_interval(mins => v_reserved_minutes)) <= (v_local_ts::date + wh.end_local)
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


-- ----------------------------------------------------------------------------
-- V-10 — Availability is O(staff × days × slots) with two EXISTS per candidate slot.
-- A 370-day window was a free CPU-exhaustion primitive on a public, unauthenticated
-- endpoint. 62 days is twice the largest documented max_lead_days (60), so no legitimate
-- caller loses anything. The route handler caps the request at 31 days on top of this.
-- ----------------------------------------------------------------------------

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


-- ----------------------------------------------------------------------------
-- V-07 + V-09 — Public booking path.
--
-- V-07: the response cached for Idempotency-Key replay contained the plaintext manage
--       token. A dump of idempotency_keys handed over control of every recent
--       appointment. The cache no longer stores it; a replayed request returns the
--       appointment with a null token and the caller is told to use the emailed link.
-- V-09: the ON CONFLICT branch overwrote name and phone of an EXISTING customer with
--       whatever an anonymous visitor typed. It now only fills gaps, never overwrites,
--       never changes marketing consent, and records the discrepancy for the business.
-- ----------------------------------------------------------------------------

create or replace function create_public_booking(
  p_business_slug text,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_marketing_consent boolean,
  p_idempotency_key text,
  p_request_hash text
)
returns table (
  appointment_id uuid,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  manage_token text,
  price_cents int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_service services%rowtype;
  v_staff_id uuid;
  v_customer_id uuid;
  v_existing_name text;
  v_name_mismatch boolean := false;
  v_appointment_id uuid;
  v_ends_at timestamptz;
  v_token text;
  v_token_hash text;
  v_status text;
  v_auto_confirm boolean;
  v_cached jsonb;
  v_cached_hash text;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    select response_body, request_hash into v_cached, v_cached_hash
    from idempotency_keys
    where scope = 'booking' and key = p_idempotency_key
      and business_id = (select id from businesses where slug = p_business_slug);
    if found then
      if v_cached_hash is distinct from coalesce(p_request_hash, '') then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
      -- No manage_token here by design (V-07): the plaintext token is unrecoverable
      -- after the original transaction, and caching it was a plaintext-secret-at-rest.
      return query select
        (v_cached->>'appointment_id')::uuid, v_cached->>'status',
        (v_cached->>'starts_at')::timestamptz, (v_cached->>'ends_at')::timestamptz,
        null::text, (v_cached->>'price_cents')::int;
      return;
    end if;
  end if;

  select * into v_business from businesses where slug = p_business_slug and active;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  select * into v_service from services where id = p_service_id and business_id = v_business.id and active;
  if not found then
    raise exception 'SERVICE_UNAVAILABLE';
  end if;

  if p_customer_email is null and p_customer_phone is null then
    raise exception 'INVALID_CUSTOMER';
  end if;

  if p_staff_id is not null then
    if not is_slot_bookable(v_business.id, p_staff_id, p_service_id, p_starts_at) then
      raise exception 'SLOT_TAKEN';
    end if;
    v_staff_id := p_staff_id;
  else
    select s.id into v_staff_id
    from staff s
    join staff_services ss on ss.staff_id = s.id and ss.business_id = s.business_id
    where s.business_id = v_business.id and s.active and ss.service_id = p_service_id
      and is_slot_bookable(v_business.id, s.id, p_service_id, p_starts_at)
    order by s.id
    limit 1;
    if v_staff_id is null then
      raise exception 'SLOT_TAKEN';
    end if;
  end if;

  if p_customer_email is not null then
    insert into customers (business_id, name, email, phone, marketing_consent)
    values (v_business.id, p_customer_name, lower(p_customer_email), p_customer_phone, coalesce(p_marketing_consent, false))
    on conflict (business_id, lower(email)) where email is not null and deleted_at is null
    -- Fill gaps only. An anonymous caller who knows an existing customer's email must not
    -- be able to rewrite that customer's name, phone or marketing consent (V-09).
    do update set phone = coalesce(customers.phone, excluded.phone)
    returning id, name into v_customer_id, v_existing_name;
    v_name_mismatch := v_existing_name is distinct from p_customer_name;
  else
    insert into customers (business_id, name, email, phone, marketing_consent)
    values (v_business.id, p_customer_name, p_customer_email, p_customer_phone, coalesce(p_marketing_consent, false))
    returning id into v_customer_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_after_minutes);
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_auto_confirm := coalesce((v_business.booking_policy->>'auto_confirm')::boolean, true);
  v_status := case when v_auto_confirm then 'confirmed' else 'pending' end;

  begin
    insert into appointments (
      business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
      access_token_hash, price_cents, duration_minutes, buffer_after_minutes, notes, created_by
    ) values (
      v_business.id, v_staff_id, p_service_id, v_customer_id, p_starts_at, v_ends_at, v_status,
      v_token_hash, v_service.price_cents, v_service.duration_minutes, v_service.buffer_after_minutes,
      p_notes, 'customer'
    ) returning id into v_appointment_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  insert into appointment_events (appointment_id, business_id, event, actor, metadata)
  values (
    v_appointment_id, v_business.id, 'created', 'customer',
    jsonb_build_object('status', v_status, 'name_mismatch', v_name_mismatch)
  );

  insert into notification_jobs (business_id, appointment_id, channel, template, payload, scheduled_for, idempotency_key)
  values (
    v_business.id, v_appointment_id, 'email', 'confirmation',
    jsonb_build_object('appointmentId', v_appointment_id, 'manageToken', v_token), now(), 'confirmation:' || v_appointment_id
  );

  if p_starts_at - interval '24 hours' > now() then
    insert into notification_jobs (business_id, appointment_id, channel, template, payload, scheduled_for, idempotency_key)
    values (
      v_business.id, v_appointment_id, 'email', 'reminder_24h',
      jsonb_build_object('appointmentId', v_appointment_id, 'manageToken', v_token), p_starts_at - interval '24 hours',
      'reminder_24h:' || v_appointment_id
    );
  end if;

  v_result := jsonb_build_object(
    'appointment_id', v_appointment_id, 'status', v_status, 'starts_at', p_starts_at,
    'ends_at', p_starts_at + make_interval(mins => v_service.duration_minutes),
    'price_cents', v_service.price_cents
  );

  if p_idempotency_key is not null then
    insert into idempotency_keys (business_id, scope, key, request_hash, response_status, response_body)
    values (v_business.id, 'booking', p_idempotency_key, coalesce(p_request_hash, ''), 201, v_result)
    on conflict (business_id, scope, key) do nothing;
  end if;

  return query select
    v_appointment_id, v_status, p_starts_at,
    p_starts_at + make_interval(mins => v_service.duration_minutes),
    v_token, v_service.price_cents;
end;
$$;

revoke all on function create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, boolean, text, text) from public;
grant execute on function create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, boolean, text, text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- V-22 / V-07 — Retention. The design specifies a purge job (§11.3, §8.8) that was never
-- implemented, so manage tokens and idempotency records lived forever.
-- ----------------------------------------------------------------------------

create or replace function purge_expired_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys int;
  v_tokens int;
  v_jobs int;
begin
  -- §7.4: the idempotency window is 24h. Keeping these rows longer buys nothing and
  -- keeps a replayable record of every booking around indefinitely.
  with d as (delete from idempotency_keys where created_at < now() - interval '24 hours' returning 1)
  select count(*)::int into v_keys from d;

  -- A manage link for a finished appointment has no purpose 30 days later.
  with t as (
    update appointments set access_token_hash = null
    where access_token_hash is not null
      and status in ('cancelled_by_client', 'cancelled_by_business', 'completed', 'no_show', 'expired')
      and ends_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int into v_tokens from t;

  -- Delivered/cancelled outbox rows are operational exhaust; 90 days matches the log
  -- retention in §8.8. Failed jobs are kept for diagnosis.
  with j as (
    delete from notification_jobs
    where status in ('sent', 'cancelled') and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::int into v_jobs from j;

  return jsonb_build_object('idempotency_keys', v_keys, 'tokens_cleared', v_tokens, 'jobs_deleted', v_jobs);
end;
$$;

revoke all on function purge_expired_artifacts() from public;
grant execute on function purge_expired_artifacts() to service_role;
