-- Core schema. See docs/architecture.md §4 for the entity-relationship rationale.

create table businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  name text not null,
  timezone text not null default 'Europe/Madrid',
  booking_policy jsonb not null default jsonb_build_object(
    'min_lead_minutes', 120,
    'max_lead_days', 60,
    'auto_confirm', true,
    'pending_expiry_minutes', 10,
    'slot_interval_minutes', 15
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'staff', 'platform_admin')),
  staff_id uuid, -- linked below via FK added after `staff` exists
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_local time not null,
  end_local time not null,
  check (end_local > start_local)
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table memberships
  add constraint memberships_staff_id_fkey foreign key (staff_id) references staff(id) on delete set null;

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  buffer_after_minutes int not null default 0 check (buffer_after_minutes >= 0),
  price_cents int not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_services (
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0 = Sunday, matches extract(dow)
  start_local time not null,
  end_local time not null,
  check (end_local > start_local)
);

create table time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  notes text,
  marketing_consent boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid not null references staff(id),
  service_id uuid not null references services(id),
  customer_id uuid not null references customers(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null, -- includes service duration + buffer (RN-02)
  status text not null default 'pending' check (status in (
    'pending', 'confirmed', 'cancelled_by_client', 'cancelled_by_business',
    'completed', 'no_show', 'expired'
  )),
  access_token_hash text, -- sha256 of the magic-link token; the plaintext is never stored
  price_cents int not null default 0,
  duration_minutes int not null,
  buffer_after_minutes int not null default 0,
  notes text,
  created_by text not null default 'customer' check (created_by in ('customer', 'owner', 'staff', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  event text not null,
  actor text not null, -- 'customer' | 'owner' | 'staff' | 'system'
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'push')),
  template text not null check (template in ('confirmation', 'reminder_24h', 'cancellation', 'reschedule', 'daily_digest')),
  payload jsonb not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  last_error text,
  idempotency_key text unique not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  business_id uuid not null references businesses(id) on delete cascade,
  scope text not null,
  key text not null,
  request_hash text not null,
  response_status int not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, scope, key)
);
