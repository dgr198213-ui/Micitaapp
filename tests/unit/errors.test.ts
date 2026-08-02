import { describe, expect, it } from "vitest";
import { ApiError, errorBody, fromPostgresError } from "@/modules/shared/errors";

describe("fromPostgresError", () => {
  it("maps a known RPC exception message to its ApiError with the right HTTP status", () => {
    const err = fromPostgresError({ message: "SLOT_TAKEN" });
    expect(err.code).toBe("SLOT_TAKEN");
    expect(err.status).toBe(409);
  });

  it("maps every documented RN/RPC error code to a distinct, sensible status", () => {
    expect(fromPostgresError({ message: "BUSINESS_NOT_FOUND" }).status).toBe(404);
    expect(fromPostgresError({ message: "SERVICE_UNAVAILABLE" }).status).toBe(410);
    expect(fromPostgresError({ message: "TOKEN_INVALID" }).status).toBe(410);
    expect(fromPostgresError({ message: "INVALID_CUSTOMER" }).status).toBe(422);
  });

  it("falls back to INTERNAL_ERROR for an unrecognized message, never leaking raw SQL errors", () => {
    const err = fromPostgresError({ message: "duplicate key value violates unique constraint" });
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.status).toBe(500);
  });

  it("falls back to INTERNAL_ERROR when there is no error at all", () => {
    expect(fromPostgresError(null).code).toBe("INTERNAL_ERROR");
  });
});

describe("errorBody", () => {
  it("propagates the requestId for support correlation (§7.5)", () => {
    const body = errorBody(new ApiError("SLOT_TAKEN"), "req_abc123");
    expect(body).toMatchObject({ error: "SLOT_TAKEN", requestId: "req_abc123" });
  });
});
