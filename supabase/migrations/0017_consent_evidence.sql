-- V-25: retain auditable evidence for the terms consent collected by public booking.
-- The compatibility wrapper keeps the original 11-argument RPC available while the
-- public route uses this extended signature. Evidence is stored in the append-only
-- appointment event stream with the database timestamp.
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
  p_request_hash text,
  p_consent_terms_version text,
  p_client_ip text
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
  v_booking record;
begin
  select * into v_booking
  from public.create_public_booking(
    p_business_slug, p_service_id, p_staff_id, p_starts_at,
    p_customer_name, p_customer_email, p_customer_phone, p_notes,
    p_marketing_consent, p_idempotency_key, p_request_hash
  );

  insert into appointment_events (appointment_id, business_id, event, actor, metadata)
  select
    v_booking.appointment_id,
    a.business_id,
    'consent_recorded',
    'customer',
    jsonb_build_object(
      'terms_version', p_consent_terms_version,
      'accepted_at', now(),
      'ip', p_client_ip
    )
  from appointments a
  where a.id = v_booking.appointment_id;

  return query select
    v_booking.appointment_id,
    v_booking.status,
    v_booking.starts_at,
    v_booking.ends_at,
    v_booking.manage_token,
    v_booking.price_cents;
end;
$$;

revoke all on function create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, boolean, text, text, text, text) from public;
grant execute on function create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, boolean, text, text, text, text) to anon, authenticated;
