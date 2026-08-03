import { describe, expect, it } from "vitest";
import { ApiError, errorBody, fromPostgresError } from "@/modules/shared/errors";

// T-F: regression for audit finding V-06 — a 500 must never carry the raw database error.
describe("errorBody information disclosure", () => {
  it("strips details from INTERNAL_ERROR responses", () => {
    const pgError = {
      message: 'null value in column "staff_id" of relation "appointments" violates not-null constraint',
      code: "23502",
      hint: "check the appointments table",
    };
    const body = errorBody(fromPostgresError(pgError), "req_test");

    expect(body.error).toBe("INTERNAL_ERROR");
    expect(body.details).toEqual({});
    expect(JSON.stringify(body)).not.toContain("appointments");
    expect(JSON.stringify(body)).not.toContain("23502");
  });

  it("still exposes details for validation errors, which the caller can act on", () => {
    const body = errorBody(new ApiError("VALIDATION_ERROR", { field: "startsAt" }), "req_test");
    expect(body.details).toEqual({ field: "startsAt" });
  });

  it("still exposes alternative slots on a 409", () => {
    const body = errorBody(new ApiError("SLOT_TAKEN", { alternatives: ["2026-09-01T09:00:00Z"] }), "req_test");
    expect(body.details).toEqual({ alternatives: ["2026-09-01T09:00:00Z"] });
  });

  it("maps a known raised code coming back from a SECURITY DEFINER function", () => {
    expect(fromPostgresError({ message: "SLOT_TAKEN" }).status).toBe(409);
  });
})
