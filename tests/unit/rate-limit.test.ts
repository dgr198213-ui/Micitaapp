import { afterEach, describe, expect, it, vi } from "vitest";
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

// V-05 regression: rate-limit.ts computes its Redis client once, at module scope, from
// process.env — so flipping NODE_ENV after the module is already loaded (or after Vite has
// statically inlined it) proves nothing. vi.resetModules() + a fresh dynamic import force a
// real re-evaluation of that module-scope branch for each case.
describe("checkRateLimit fail-open/fail-closed split (V-05)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails CLOSED in production when Upstash is not configured", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { checkRateLimit: freshCheckRateLimit } = await import("@/lib/rate-limit");
    const result = await freshCheckRateLimit("prod-scope", "1.2.3.4", 1, 60);

    expect(result.success).toBe(false);
  });

  it("fails OPEN outside production when Upstash is not configured", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { checkRateLimit: freshCheckRateLimit } = await import("@/lib/rate-limit");
    const result = await freshCheckRateLimit("test-scope-2", "1.2.3.4", 1, 60);

    expect(result.success).toBe(true);
  });
});
