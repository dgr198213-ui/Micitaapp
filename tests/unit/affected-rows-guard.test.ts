import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { updateCustomerNotes, anonymizeCustomer } from "@/modules/crm/service";
import { setServiceActive } from "@/modules/catalog/service";
import { setStaffActive } from "@/modules/resources/service";

// V-21 regression: an .update() that RLS silently blocks (cross-business id, or an id that
// doesn't exist) matches zero rows without PostgREST treating that as an error. Without
// checking what actually came back, these functions would report success while changing
// nothing. Each fake client below simulates exactly that: a chain that resolves with
// data: [] and error: null, same as a real RLS-blocked update.
function fakeClient(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  const builder = {
    update: () => builder,
    eq: () => builder,
    select: () => Promise.resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

describe("V-21: update helpers reject a silently-blocked (0-row) update", () => {
  it("updateCustomerNotes throws FORBIDDEN when RLS blocks the update", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(updateCustomerNotes(client, "some-id", "notes")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateCustomerNotes succeeds when the update actually matched a row", async () => {
    const client = fakeClient({ data: [{ id: "some-id" }], error: null });
    await expect(updateCustomerNotes(client, "some-id", "notes")).resolves.toBeUndefined();
  });

  it("anonymizeCustomer throws FORBIDDEN when RLS blocks the update", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(anonymizeCustomer(client, "some-id")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("setServiceActive throws FORBIDDEN when RLS blocks the update (e.g. a cross-business id)", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(setServiceActive(client, "some-id", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("setStaffActive throws FORBIDDEN when RLS blocks the update (e.g. a cross-business id)", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(setStaffActive(client, "some-id", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("setStaffActive succeeds when the update actually matched a row", async () => {
    const client = fakeClient({ data: [{ id: "some-id" }], error: null });
    await expect(setStaffActive(client, "some-id", false)).resolves.toBeUndefined();
  });
});
