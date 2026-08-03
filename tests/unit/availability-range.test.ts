import { describe, expect, it } from "vitest";
import { availabilityQuerySchema, MAX_RANGE_DAYS } from "@/modules/scheduling/availability-query";

// V-10 regression: an unbounded date range on this public, unauthenticated endpoint is a
// CPU-exhaustion primitive against get_available_slots (O(staff x days x slots)).
describe("availabilityQuerySchema range cap (V-10)", () => {
  const base = { service: "11111111-1111-1111-1111-111111111111" };

  it(`rejects a range wider than ${MAX_RANGE_DAYS} days`, () => {
    const result = availabilityQuerySchema.safeParse({ ...base, from: "2026-01-01", to: "2026-02-10" }); // 40 days
    expect(result.success).toBe(false);
  });

  it(`accepts a range of exactly ${MAX_RANGE_DAYS} days`, () => {
    const result = availabilityQuerySchema.safeParse({ ...base, from: "2026-01-01", to: "2026-01-31" });
    expect(result.success).toBe(true);
  });

  it("accepts a same-day range", () => {
    const result = availabilityQuerySchema.safeParse({ ...base, from: "2026-01-01", to: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("rejects an inverted range (to before from)", () => {
    const result = availabilityQuerySchema.safeParse({ ...base, from: "2026-01-10", to: "2026-01-01" });
    expect(result.success).toBe(false);
  });
});
