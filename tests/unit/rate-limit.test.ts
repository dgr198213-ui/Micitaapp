import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

describe("clientIp", () => {
  it("takes the first hop from X-Forwarded-For", () => {
    const req = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(clientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    const req = new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.9" } });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("returns 'unknown' rather than throwing when no IP header is present", () => {
    const req = new Request("https://example.com");
    expect(clientIp(req)).toBe("unknown");
  });
});

describe("checkRateLimit without Upstash configured", () => {
  it("never blocks locally (fails open, documented in the production checklist)", async () => {
    const result = await checkRateLimit("test-scope", "1.2.3.4", 1, 60);
    expect(result.success).toBe(true);
  });
});
