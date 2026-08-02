import { describe, expect, it } from "vitest";
import { formatInBusinessTimezone } from "@/modules/shared/time";

describe("formatInBusinessTimezone", () => {
  it("renders the business's local time, not UTC (RN-06)", () => {
    // 2026-08-04 08:00 UTC is 10:00 in Europe/Madrid during CEST (UTC+2).
    expect(formatInBusinessTimezone("2026-08-04T08:00:00Z", "Europe/Madrid")).toBe("10:00");
  });

  it("adjusts across the DST boundary for the same wall-clock instant (T-02)", () => {
    // Same 08:00 UTC instant, but in January (CET, UTC+1) reads as 09:00 local.
    expect(formatInBusinessTimezone("2026-01-04T08:00:00Z", "Europe/Madrid")).toBe("09:00");
  });

  it("is independent of the device's own timezone", () => {
    expect(formatInBusinessTimezone("2026-08-04T08:00:00Z", "America/New_York")).toBe("04:00");
  });
});
