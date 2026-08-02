-- Modern Supabase projects no longer auto-expose new tables to the Data API roles, so
-- table-level GRANTs are required in addition to the RLS policies in 0005. The RPC functions
-- in 0006-0008 are SECURITY DEFINER and run as the function owner, so anon needs no table
-- grants at all for the public booking path — only EXECUTE on those functions (already
-- granted). These GRANTs cover the authenticated /app panel, which queries tables directly.

grant usage on schema public to anon, authenticated, service_role;

grant select on businesses, business_hours, staff, services, staff_services to anon;

grant select, update on businesses to authenticated;
grant insert on businesses to authenticated; -- RLS restricts to platform_admin
grant select, insert, update, delete on business_hours to authenticated;
grant select, insert, update, delete on memberships to authenticated;
grant select, insert, update, delete on staff to authenticated;
grant select, insert, update, delete on services to authenticated;
grant select, insert, delete on staff_services to authenticated;
grant select, insert, update, delete on working_hours to authenticated;
grant select, insert, update, delete on time_off to authenticated;
grant select, insert, update, delete on customers to authenticated;
grant select, insert, update on appointments to authenticated;
grant select, insert on appointment_events to authenticated;
grant select on notification_jobs to authenticated;

grant all on all tables in schema public to service_role;
