-- ADR-003 condition #2: every business table has RLS active. Inverted on purpose after
-- audit finding V-15: the previous version asserted over a hardcoded list of 13 tables,
-- so any table added later silently passed. This version fails for ANY table in `public`
-- without RLS unless it is explicitly listed as exempt below.
begin;
select plan(1);

select is_empty(
  $$select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
      -- Exemptions must be justified here, one line each. Empty today.
      and c.relname not in ('__no_exemptions__')$$,
  'no table in schema public is missing RLS'
);

select * from finish();
rollback;
