-- V-18: the public booking widget's data source is scoped per business — an anonymous
-- visitor can no longer dump every business's staff/services in one unfiltered query.
begin;
select plan(6);
reset role;

set local role anon;

select throws_ok(
  $$select * from staff$$,
  '42501', null,
  'V-18: anon cannot read the staff table directly at all anymore'
);

select throws_ok(
  $$select * from services$$,
  '42501', null,
  'V-18: anon cannot read the services table directly at all anymore'
);

-- get_business_storefront only ever returns the one business asked for.
select is(
  (select jsonb_array_length(get_business_storefront('barberia-lujan') -> 'staff')),
  1,
  'V-18: the barbería storefront lists exactly its own 1 staff member'
);

select is(
  (select get_business_storefront('barberia-lujan') -> 'staff' -> 0 ->> 'displayName'),
  'Antonio Luján',
  'V-18: the storefront staff entry is the barbería''s own, not another business''s'
);

select is(
  (select jsonb_array_length(get_business_storefront('salon-maria') -> 'staff')),
  4,
  'V-18: a different business''s storefront lists only its own staff (4), not a platform-wide dump'
);

select is(
  get_business_storefront('this-slug-does-not-exist'),
  null,
  'V-18: an unknown slug returns null, not an error that could leak internals'
);

select * from finish();
rollback;
