begin;
select plan(2);

select is(
  (select count(*)::int from memberships where role = 'platform_admin'),
  0,
  'V-02: memberships contains no platform_admin rows before contraction'
);

select throws_ok(
  $$insert into memberships (business_id, user_id, role) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'platform_admin')$$,
  '23514',
  null,
  'V-02: memberships CHECK rejects platform_admin after contraction'
);

select * from finish();
rollback;
