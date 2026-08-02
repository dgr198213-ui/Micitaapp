-- T-04: a tenant must never read or write another tenant's private data.
-- Public storefront tables (businesses, business_hours, staff, services, staff_services)
-- are intentionally excluded here — they are meant to be readable cross-tenant.
begin;
select plan(9);

reset role; -- superuser bypasses RLS; used only to arrange fixture data

insert into customers (id, business_id, name, email)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Cliente Privado', 'privado@example.com');

insert into appointments (
  id, business_id, staff_id, service_id, customer_id, starts_at, ends_at, status,
  duration_minutes, buffer_after_minutes, price_cents
) values (
  '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000201',
  '40000000-0000-0000-0000-000000000001', now() + interval '3 days', now() + interval '3 days 1 hour',
  'confirmed', 60, 15, 4500
);

-- Act as Salón María's owner (business A), probing business B (Centro Bienestar).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is_empty(
  $$select 1 from customers where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B customers'
);
select is_empty(
  $$select 1 from appointments where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B appointments'
);
select is_empty(
  $$select 1 from working_hours where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B working_hours'
);
select is_empty(
  $$select 1 from time_off where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B time_off'
);
select is_empty(
  $$select 1 from memberships where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B memberships'
);
select is_empty(
  $$select 1 from notification_jobs where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business A owner cannot read business B notification_jobs'
);

update customers set name = 'hacked'
where business_id = '30000000-0000-0000-0000-000000000001' and id = '40000000-0000-0000-0000-000000000001';

reset role;
select is(
  (select name from customers where id = '40000000-0000-0000-0000-000000000001'),
  'Cliente Privado',
  'business A owner cannot modify business B customers (RLS blocks the write, not just the read)'
);

-- Positive control: business B's own owner can see their own private data.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;

select isnt_empty(
  $$select 1 from customers where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business B owner CAN read their own customers'
);
select isnt_empty(
  $$select 1 from appointments where business_id = '30000000-0000-0000-0000-000000000001'$$,
  'business B owner CAN read their own appointments'
);

select * from finish();
rollback;
