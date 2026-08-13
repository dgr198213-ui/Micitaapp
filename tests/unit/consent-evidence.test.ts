import { describe, expect, it, vi } from "vitest";
import { createBooking } from "@/modules/scheduling/service";

const rpc = vi.fn().mockResolvedValue({
  data: [
    {
      appointment_id: "00000000-0000-0000-0000-000000000001",
      status: "confirmed",
      starts_at: "2026-08-20T10:00:00+00:00",
      ends_at: "2026-08-20T10:30:00+00:00",
      manage_token: "token",
      price_cents: 1000,
    },
  ],
  error: null,
});

const client = { rpc } as never;

describe("public booking consent evidence (V-25)", () => {
  it("passes the server-controlled terms version and client IP to the RPC", async () => {
    await createBooking(client, {
      businessSlug: "demo",
      serviceId: "00000000-0000-0000-0000-000000000002",
      staffId: null,
      startsAt: "2026-08-20T10:00:00+00:00",
      customer: { name: "Cliente", email: "cliente@example.com" },
      consent: { terms: true, marketing: false },
      consentTermsVersion: "2026-08-03",
      clientIp: "203.0.113.10",
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_public_booking",
      expect.objectContaining({
        p_consent_terms_version: "2026-08-03",
        p_client_ip: "203.0.113.10",
      })
    );
  });
});
