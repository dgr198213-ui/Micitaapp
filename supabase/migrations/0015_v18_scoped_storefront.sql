-- ============================================================================
-- V-18 — the public booking widget's data source leaked the entire platform.
--
-- Problem: staff_public_read and services_public_read granted anon SELECT filtered only by
-- `active`, with no business_id condition at all. Row Level Security restricts which rows
-- pass a per-row check; it cannot make an unfiltered `select * from staff` return only "the
-- business the client meant" — a single unscoped REST call against either table dumped
-- every active staff member's name, or every active service's name and price, across every
-- business on the platform. Same pattern already used correctly for availability
-- (get_available_slots) and booking (create_public_booking): the fix is a narrow,
-- business-scoped SECURITY DEFINER function, not a table-level policy.
-- ============================================================================

create or replace function get_business_storefront(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'timezone', b.timezone,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id,
        'name', sv.name,
        'durationMinutes', sv.duration_minutes,
        'bufferAfterMinutes', sv.buffer_after_minutes,
        'priceCents', sv.price_cents
      ) order by sv.name)
      from services sv
      where sv.business_id = b.id and sv.active
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'displayName', st.display_name) order by st.display_name)
      from staff st
      where st.business_id = b.id and st.active
    ), '[]'::jsonb)
  )
  from businesses b
  where b.slug = p_slug and b.active
$$;

revoke all on function get_business_storefront(text) from public;
grant execute on function get_business_storefront(text) to anon, authenticated;

drop policy if exists staff_public_read on staff;
drop policy if exists services_public_read on services;
revoke select on staff from anon;
revoke select on services from anon;
-- staff_member_read / services_member_read (owner/staff, scoped by auth_business_role) are
-- untouched — the authenticated dashboard still reads these tables directly.
