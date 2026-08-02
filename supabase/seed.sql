-- Seed data (§16.3): three archetypal businesses covering the main edge cases —
-- a solo barber, a 4-professional salon with overlapping services, and a wellness
-- centre with a split shift (morning/afternoon).

-- A demo owner user per business. On a real Supabase project these rows are created by
-- Supabase Auth (sign-up / magic link); this INSERT only works locally because
-- scripts/local_pg_auth_shim.sql defines a minimal auth.users table for testing.
-- Password sign-in is not wired through this seed — use magic links locally, or adapt
-- this block if your local stack has full GoTrue support.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@barberia-lujan.test'),
  ('00000000-0000-0000-0000-000000000002', 'owner@salon-maria.test'),
  ('00000000-0000-0000-0000-000000000003', 'owner@centro-bienestar.test')
on conflict (id) do nothing;

-- 1) Barbería de 1 persona
with b as (
  insert into businesses (id, slug, name, timezone, booking_policy)
  values (
    '10000000-0000-0000-0000-000000000001', 'barberia-lujan', 'Barbería Luján', 'Europe/Madrid',
    jsonb_build_object('min_lead_minutes', 60, 'max_lead_days', 45, 'auto_confirm', true, 'pending_expiry_minutes', 10, 'slot_interval_minutes', 15)
  ) returning id
), m as (
  insert into memberships (business_id, user_id, role, staff_id)
  select id, '00000000-0000-0000-0000-000000000001', 'owner', null from b
), st as (
  insert into staff (id, business_id, display_name)
  select '10000000-0000-0000-0000-000000000101', id, 'Antonio Luján' from b
  returning id, business_id
), sv as (
  insert into services (id, business_id, name, duration_minutes, buffer_after_minutes, price_cents)
  select * from (values
    ('10000000-0000-0000-0000-000000000201'::uuid, (select id from b), 'Corte de pelo', 30, 5, 1500),
    ('10000000-0000-0000-0000-000000000202'::uuid, (select id from b), 'Corte + barba', 45, 10, 2200),
    ('10000000-0000-0000-0000-000000000203'::uuid, (select id from b), 'Afeitado clásico', 30, 10, 1800)
  ) as t(id, business_id, name, duration_minutes, buffer_after_minutes, price_cents)
  returning id
)
insert into staff_services (business_id, staff_id, service_id)
select '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', sv.id from sv;

insert into working_hours (business_id, staff_id, weekday, start_local, end_local)
select '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', weekday, '10:00', '20:00'
from generate_series(2, 6) as weekday; -- Tue-Sat

-- 2) Salón de 4 profesionales con servicios solapados
insert into businesses (id, slug, name, timezone, booking_policy) values (
  '20000000-0000-0000-0000-000000000001', 'salon-maria', 'Salón María', 'Europe/Madrid',
  jsonb_build_object('min_lead_minutes', 120, 'max_lead_days', 60, 'auto_confirm', true, 'pending_expiry_minutes', 10, 'slot_interval_minutes', 15)
);
insert into memberships (business_id, user_id, role, staff_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'owner', null);

insert into staff (id, business_id, display_name) values
  ('20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001', 'María Fernández'),
  ('20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001', 'Laura Gómez'),
  ('20000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000001', 'Carla Ruiz'),
  ('20000000-0000-0000-0000-000000000104', '20000000-0000-0000-0000-000000000001', 'Nuria Vidal');

insert into services (id, business_id, name, duration_minutes, buffer_after_minutes, price_cents) values
  ('20000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000001', 'Corte y peinado', 45, 10, 2500),
  ('20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000001', 'Coloración', 90, 15, 5500),
  ('20000000-0000-0000-0000-000000000203', '20000000-0000-0000-0000-000000000001', 'Manicura', 40, 5, 1800),
  ('20000000-0000-0000-0000-000000000204', '20000000-0000-0000-0000-000000000001', 'Tratamiento capilar', 60, 10, 3200);

insert into staff_services (business_id, staff_id, service_id) values
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000201'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000202'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000201'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000204'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000203'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000104', '20000000-0000-0000-0000-000000000201'),
  ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000104', '20000000-0000-0000-0000-000000000203');

insert into working_hours (business_id, staff_id, weekday, start_local, end_local)
select '20000000-0000-0000-0000-000000000001', s.id, weekday, '09:30', '19:30'
from (values
  ('20000000-0000-0000-0000-000000000101'::uuid), ('20000000-0000-0000-0000-000000000102'::uuid),
  ('20000000-0000-0000-0000-000000000103'::uuid), ('20000000-0000-0000-0000-000000000104'::uuid)
) as s(id)
cross join generate_series(1, 6) as weekday; -- Mon-Sat

-- 3) Centro de bienestar con horario partido y festivos (time_off)
insert into businesses (id, slug, name, timezone, booking_policy) values (
  '30000000-0000-0000-0000-000000000001', 'centro-bienestar', 'Centro Bienestar Aurora', 'Europe/Madrid',
  jsonb_build_object('min_lead_minutes', 180, 'max_lead_days', 30, 'auto_confirm', true, 'pending_expiry_minutes', 10, 'slot_interval_minutes', 30)
);
insert into memberships (business_id, user_id, role, staff_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'owner', null);

insert into staff (id, business_id, display_name) values
  ('30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000001', 'Sara Molina'),
  ('30000000-0000-0000-0000-000000000102', '30000000-0000-0000-0000-000000000001', 'Javier Ortiz');

insert into services (id, business_id, name, duration_minutes, buffer_after_minutes, price_cents) values
  ('30000000-0000-0000-0000-000000000201', '30000000-0000-0000-0000-000000000001', 'Masaje relajante 60min', 60, 15, 4500),
  ('30000000-0000-0000-0000-000000000202', '30000000-0000-0000-0000-000000000001', 'Reflexología', 45, 10, 3200);

insert into staff_services (business_id, staff_id, service_id) values
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000201'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000202'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000102', '30000000-0000-0000-0000-000000000201');

-- Split shift: 09:00-13:30 and 16:00-20:00, Mon-Fri.
insert into working_hours (business_id, staff_id, weekday, start_local, end_local)
select '30000000-0000-0000-0000-000000000001', s.id, weekday, window_start, window_end
from (values
  ('30000000-0000-0000-0000-000000000101'::uuid), ('30000000-0000-0000-0000-000000000102'::uuid)
) as s(id)
cross join generate_series(1, 5) as weekday
cross join (values ('09:00'::time, '13:30'::time), ('16:00'::time, '20:00'::time)) as w(window_start, window_end);

insert into time_off (business_id, staff_id, starts_at, ends_at, reason) values
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000101', '2026-12-25 00:00:00+01', '2026-12-26 00:00:00+01', 'Navidad'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000102', '2026-12-25 00:00:00+01', '2026-12-26 00:00:00+01', 'Navidad');
