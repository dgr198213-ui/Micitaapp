-- The non-negotiable guarantee (RN-01, ADR-006): double-booking is impossible at the
-- database engine level. A cancelled/expired/completed appointment does not hold the slot,
-- hence the WHERE clause restricting the constraint to statuses that still occupy time.
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

create index idx_appointments_business_starts on appointments (business_id, starts_at);
create index idx_appointments_staff_starts on appointments (staff_id, starts_at);
create index idx_appointments_customer_starts on appointments (customer_id, starts_at desc);
create unique index idx_appointments_access_token on appointments (access_token_hash) where access_token_hash is not null;
create index idx_appointments_status_starts on appointments (status, starts_at);

create index idx_working_hours_staff_weekday on working_hours (staff_id, weekday);
create index idx_business_hours_business_weekday on business_hours (business_id, weekday);
create index idx_time_off_staff_range on time_off using gist (staff_id, tstzrange(starts_at, ends_at, '[)'));

create unique index idx_customers_business_email on customers (business_id, lower(email)) where email is not null and deleted_at is null;
create index idx_customers_business on customers (business_id);

create index idx_notification_jobs_due on notification_jobs (status, scheduled_for) where status = 'pending';
create index idx_notification_jobs_appointment on notification_jobs (appointment_id);

create index idx_staff_business on staff (business_id) where active;
create index idx_services_business on services (business_id) where active;
create index idx_memberships_user on memberships (user_id);
create index idx_appointment_events_appointment on appointment_events (appointment_id, created_at);
