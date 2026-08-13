import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security";

describe("Content Security Policy (V-12)", () => {
  it("uses a nonce instead of unsafe-inline for scripts", () => {
    const csp = buildCsp("test-nonce");

    expect(csp).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
