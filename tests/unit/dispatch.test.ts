import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/modules/notifications/dispatch";

// V-08 regression: without RESEND_API_KEY, sendEmail used to return silently, which let the
// caller mark the notification job 'sent' with nothing actually delivered.
describe("sendEmail without RESEND_API_KEY (V-08)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws in production so the job fails visibly instead of being marked sent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail("cliente@example.com", "Asunto", "<p>hola</p>")).rejects.toThrow(
      "RESEND_API_KEY is not configured"
    );
  });

  it("does not throw outside production (local dev without an API key)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.RESEND_API_KEY;

    await expect(sendEmail("cliente@example.com", "Asunto", "<p>hola</p>")).resolves.toBeUndefined();
  });

  it("calls the Resend API when a key is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail("cliente@example.com", "Asunto", "<p>hola</p>");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });
});
