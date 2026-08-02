-- Row Level Security. Every business table is covered (RNF-07 / ADR-003 condition #1).
-- Tables with no anon/authenticated policy at all (appointments, customers, appointment_events,
-- notification_jobs, idempotency_keys) are reachable by the public only through the
-- SECURITY DEFINER RPC functions in 0007_public_booking.sql, never through direct table access.

alter table businesses enable row level security;
alter table business_hours enable row level security;
alter table memberships enable row level security;
alter table staff enable row level security;
alter table services enable row level security;
alter table staff_services enable row level security;
alter table working_hours enable row level security;
alter table time_off enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table appointment_events enable row level security;
alter table notification_jobs enable row level security;
alter table idempotency_keys enable row level security;

-- businesses: storefront fields are public by design; full row is not sensitive.
create policy businesses_public_read on businesses
  for select to anon, authenticated using (active);
create policy businesses_member_read on businesses
  for select to authenticated using (auth_business_role(id) is not null or auth_is_platform_admin());
create policy businesses_owner_write on businesses
  for update to authenticated
  using (auth_business_role(id) = 'owner' or auth_is_platform_admin())
  with check (auth_business_role(id) = 'owner' or auth_is_platform_admin());
create policy businesses_admin_insert on businesses
  for insert to authenticated with check (auth_is_platform_admin());

-- business_hours: public read (storefront), owner write.
create policy business_hours_public_read on business_hours
  for select to anon, authenticated using (true);
create policy business_hours_owner_write on business_hours
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');

-- memberships: members can see their own business roster; owner manages it.
create policy memberships_business_read on memberships
  for select to authenticated using (auth_business_role(business_id) is not null);
create policy memberships_owner_write on memberships
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');

-- staff: public read (booking widget needs names), owner write.
create policy staff_public_read on staff
  for select to anon, authenticated using (active);
create policy staff_member_read on staff
  for select to authenticated using (auth_business_role(business_id) is not null);
create policy staff_owner_write on staff
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');

-- services: public read (booking widget catalog), owner write.
create policy services_public_read on services
  for select to anon, authenticated using (active);
create policy services_member_read on services
  for select to authenticated using (auth_business_role(business_id) is not null);
create policy services_owner_write on services
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');

-- staff_services: same visibility as services; only owner edits the mapping.
create policy staff_services_public_read on staff_services
  for select to anon, authenticated using (true);
create policy staff_services_owner_write on staff_services
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');

-- working_hours / time_off: never exposed to anon directly (only via get_available_slots).
-- Owner manages everything; staff manage their own absences (RN-03 boundary).
create policy working_hours_owner_all on working_hours
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');
create policy working_hours_staff_read on working_hours
  for select to authenticated using (staff_id = auth_staff_id(business_id));

create policy time_off_owner_all on time_off
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');
create policy time_off_staff_own on time_off
  for all to authenticated
  using (staff_id = auth_staff_id(business_id))
  with check (staff_id = auth_staff_id(business_id));

-- customers: never exposed to anon. Owner sees all; staff only customers of their own appointments.
create policy customers_owner_all on customers
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');
create policy customers_staff_read on customers
  for select to authenticated using (
    auth_business_role(business_id) = 'staff'
    and exists (
      select 1 from appointments a
      where a.customer_id = customers.id and a.staff_id = auth_staff_id(business_id)
    )
  );
-- Staff can create a customer record for a walk-in/phone booking (§1.3 manual appointment
-- creation implies this — "Crear cita: Staff ✅" would otherwise be impossible for a new client).
create policy customers_staff_insert on customers
  for insert to authenticated with check (auth_business_role(business_id) = 'staff');

-- appointments: never exposed to anon (booking/cancel/reschedule go through RPCs).
create policy appointments_owner_all on appointments
  for all to authenticated
  using (auth_business_role(business_id) = 'owner')
  with check (auth_business_role(business_id) = 'owner');
create policy appointments_staff_own on appointments
  for select to authenticated using (staff_id = auth_staff_id(business_id));
create policy appointments_staff_write_own on appointments
  for update to authenticated
  using (staff_id = auth_staff_id(business_id))
  with check (staff_id = auth_staff_id(business_id));
create policy appointments_member_insert on appointments
  for insert to authenticated with check (auth_business_role(business_id) is not null);

-- appointment_events: read-only audit trail for members; inserted by RPCs/server code.
create policy appointment_events_member_read on appointment_events
  for select to authenticated using (auth_business_role(business_id) is not null);
create policy appointment_events_member_insert on appointment_events
  for insert to authenticated with check (auth_business_role(business_id) is not null);

-- notification_jobs: owner-visible only; dispatched by the cron worker via service_role.
create policy notification_jobs_owner_read on notification_jobs
  for select to authenticated using (auth_business_role(business_id) = 'owner');

-- idempotency_keys: no direct client access at all; written only by SECURITY DEFINER RPCs.
