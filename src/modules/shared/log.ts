// Structured JSON logs (§14.2). Never log email, phone, customer name or tokens — only
// identifiers, per the RGPD-driven rule in the architecture doc.

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

type LogFields = {
  requestId: string;
  businessId?: string | null;
  userId?: string | null;
  event: string;
  durationMs?: number;
  outcome: "success" | "error";
  [key: string]: unknown;
};

export function logEvent(fields: LogFields) {
  console.log(
    JSON.stringify({
      level: fields.outcome === "error" ? "error" : "info",
      ts: new Date().toISOString(),
      ...fields,
    })
  );
}
