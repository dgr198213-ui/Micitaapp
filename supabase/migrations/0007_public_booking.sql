-- Public write path (§7). These SECURITY DEFINER functions are the *only* way anon can ever
-- mutate appointments/customers: RLS grants anon no direct table access, so every business
-- rule (RN-01..RN-07) is enforced here, server-side, regardless of what the client sends
-- (Tampering mitigation, §8.1). The exclusion constraint is still the final authority on
-- RN-01 — the is_slot_bookable() pre-check just turns the common case into a clean error
-- instead of relying solely on catching exclusion_violation.

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
  ends_at timestamptz, -- customer-visible end: service duration only, buffer excluded
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
      return query select
        (v_cached->>'appointment_id')::uuid, v_cached->>'status',
        (v_cached->>'starts_at')::timestamptz, (v_cached->>'ends_at')::timestamptz,
        v_cached->>'manage_token', (v_cached->>'price_cents')::int;
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
    join staff_services ss on ss.staff_id = s.id
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
    do update set name = excluded.name, phone = coalesce(excluded.phone, customers.phone)
    returning id into v_customer_id;
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
  values (v_appointment_id, v_business.id, 'created', 'customer', jsonb_build_object('status', v_status));

  -- The manage link's plaintext token is carried in the outbox payload, not just the
  -- hash on the appointment row (§8.6 stores only the hash there): the confirmation and
  -- 24h-reminder emails need a working "manage my appointment" link, and the plaintext
  -- cannot be recovered from the hash once this transaction commits. This is a narrow,
  -- deliberate exception — notification_jobs is only readable by the owner and by
  -- service_role, never by anon or by other tenants (RLS, §5 of this file's migration set).
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
    'manage_token', v_token, 'price_cents', v_service.price_cents
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

create or replace function get_appointment_by_token(p_token text)
returns table (
  appointment_id uuid, status text, starts_at timestamptz, ends_at timestamptz,
  service_name text, staff_name text, business_name text, business_timezone text,
  price_cents int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
begin
  return query
  select a.id, a.status, a.starts_at, a.starts_at + make_interval(mins => a.duration_minutes),
         sv.name, st.display_name, b.name, b.timezone, a.price_cents
  from appointments a
  join services sv on sv.id = a.service_id
  join staff st on st.id = a.staff_id
  join businesses b on b.id = a.business_id
  where a.access_token_hash = v_hash;

  if not found then
    raise exception 'TOKEN_INVALID';
  end if;
end;
$$;

revoke all on function get_appointment_by_token(text) from public;
grant execute on function get_appointment_by_token(text) to anon, authenticated;

create or replace function cancel_appointment_by_token(p_token text)
returns table (appointment_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
  v_appointment appointments%rowtype;
begin
  select * into v_appointment from appointments where access_token_hash = v_hash;
  if not found then
    raise exception 'TOKEN_INVALID';
  end if;
  if v_appointment.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_STATE';
  end if;

  update appointments set status = 'cancelled_by_client' where id = v_appointment.id;

  insert into appointment_events (appointment_id, business_id, event, actor)
  values (v_appointment.id, v_appointment.business_id, 'cancelled_by_client', 'customer');

  -- Nobody receives a reminder for a cancelled appointment (§11.2).
  update notification_jobs set status = 'cancelled'
  where notification_jobs.appointment_id = v_appointment.id and notification_jobs.status = 'pending';

  return query select v_appointment.id, 'cancelled_by_client'::text;
end;
$$;

revoke all on function cancel_appointment_by_token(text) from public;
grant execute on function cancel_appointment_by_token(text) to anon, authenticated;

create or replace function reschedule_appointment_by_token(p_token text, p_new_starts_at timestamptz)
returns table (appointment_id uuid, status text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
  v_appointment appointments%rowtype;
  v_new_ends_at timestamptz;
begin
  select * into v_appointment from appointments where access_token_hash = v_hash;
  if not found then
    raise exception 'TOKEN_INVALID';
  end if;
  if v_appointment.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_STATE';
  end if;

  if not is_slot_bookable(v_appointment.business_id, v_appointment.staff_id, v_appointment.service_id, p_new_starts_at, v_appointment.id) then
    raise exception 'SLOT_TAKEN';
  end if;

  v_new_ends_at := p_new_starts_at + make_interval(mins => v_appointment.duration_minutes + v_appointment.buffer_after_minutes);

  begin
    update appointments set starts_at = p_new_starts_at, ends_at = v_new_ends_at
    where id = v_appointment.id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  insert into appointment_events (appointment_id, business_id, event, actor, metadata)
  values (
    v_appointment.id, v_appointment.business_id, 'rescheduled', 'customer',
    jsonb_build_object('from', v_appointment.starts_at, 'to', p_new_starts_at)
  );

  update notification_jobs set status = 'cancelled'
  where notification_jobs.appointment_id = v_appointment.id and notification_jobs.status = 'pending' and template = 'reminder_24h';

  if p_new_starts_at - interval '24 hours' > now() then
    insert into notification_jobs (business_id, appointment_id, channel, template, payload, scheduled_for, idempotency_key)
    values (
      v_appointment.business_id, v_appointment.id, 'email', 'reminder_24h',
      jsonb_build_object('appointmentId', v_appointment.id, 'manageToken', p_token), p_new_starts_at - interval '24 hours',
      'reminder_24h:' || v_appointment.id || ':' || extract(epoch from p_new_starts_at)::text
    );
  end if;

  return query select v_appointment.id, v_appointment.status, p_new_starts_at,
    p_new_starts_at + make_interval(mins => v_appointment.duration_minutes);
end;
$$;

revoke all on function reschedule_appointment_by_token(text, timestamptz) from public;
grant execute on function reschedule_appointment_by_token(text, timestamptz) to anon, authenticated;
