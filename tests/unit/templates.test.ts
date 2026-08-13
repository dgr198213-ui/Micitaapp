import { describe, expect, it } from "vitest";
import { confirmationEmail } from "@/modules/notifications/templates";

const context = {
  businessName: "Mi negocio",
  serviceName: "Consulta",
  staffName: "Ana",
  customerName: "<script>alert('xss')</script>",
  startsAtLocal: "martes, 10:00",
  manageUrl: "https://example.com/r/token",
};

describe("notification email templates (V-20)", () => {
  it("escapes customer-controlled HTML in the confirmation email", () => {
    const { html } = confirmationEmail(context);

    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });
});
