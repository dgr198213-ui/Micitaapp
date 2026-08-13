-- V-02 contraction: platform_admin is represented by platform_admins, never memberships.
-- Do not silently discard legacy rows: deployment must stop until data is reconciled.
do $$
begin
  if exists (select 1 from memberships where role = 'platform_admin') then
    raise exception 'V-02 contraction blocked: memberships still contain platform_admin rows';
  end if;
end;
$$;

alter table memberships drop constraint memberships_role_check;
alter table memberships add constraint memberships_role_check check (role in ('owner', 'staff'));
