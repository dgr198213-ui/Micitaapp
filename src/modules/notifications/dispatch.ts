import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { formatInBusinessTimezone, formatDateInBusinessTimezone } from "@/modules/shared/time";
import { cancellationEmail, confirmationEmail, reminderEmail, type AppointmentEmailContext } from "./templates";

type AdminClient = SupabaseClient<Database>;
type NotificationJob = Database["public"]["Tables"]["notification_jobs"]["Row"];

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(JSON.stringify({ level: "warn", event: "email.skipped_no_api_key", to, subject }));
    return;
  }

  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? "reservas@micitaapp.com";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

async function loadEmailContext(
  admin: AdminClient,
  appointmentId: string,
  manageToken: string | undefined,
  siteUrl: string
): Promise<{ to: string; ctx: AppointmentEmailContext } | null> {
  const { data, error } = await admin
    .from("appointments")
    .select("starts_at, businesses(name, timezone), services(name), staff(display_name), customers(name, email)")
    .eq("id", appointmentId)
    .maybeSingle<{
      starts_at: string;
      businesses: { name: string; timezone: string } | null;
      services: { name: string } | null;
      staff: { display_name: string } | null;
      customers: { name: string; email: string | null } | null;
    }>();

  if (error || !data || !data.customers?.email || !data.businesses || !data.services || !data.staff) {
    return null;
  }

  return {
    to: data.customers.email,
    ctx: {
      businessName: data.businesses.name,
      serviceName: data.services.name,
      staffName: data.staff.display_name,
      customerName: data.customers.name,
      startsAtLocal: `${formatDateInBusinessTimezone(data.starts_at, data.businesses.timezone)} ${formatInBusinessTimezone(data.starts_at, data.businesses.timezone)}`,
      manageUrl: manageToken ? `${siteUrl}/r/${manageToken}` : siteUrl,
    },
  };
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Claims due jobs with FOR UPDATE SKIP LOCKED (safe under overlapping cron invocations,
 * §11.3) and sends each one. The manage-appointment link's plaintext token travels in the
 * job's own payload (set at creation time by the SQL functions in 0007) since it cannot be
 * recovered from the sha256 hash stored on the appointment row.
 */
export async function dispatchDueNotifications(admin: AdminClient, limit = 25): Promise<DispatchSummary> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  const { data: jobs, error } = await admin.rpc("claim_notification_jobs", { p_limit: limit });
  if (error) {
    throw new Error(`claim_notification_jobs failed: ${error.message}`);
  }

  summary.claimed = jobs?.length ?? 0;

  for (const job of (jobs ?? []) as NotificationJob[]) {
    try {
      if (job.channel !== "email") {
        await admin.rpc("mark_notification_failed", { p_id: job.id, p_error: `channel '${job.channel}' not implemented in MVP` });
        summary.skipped += 1;
        continue;
      }
      if (!job.appointment_id) {
        await admin.rpc("mark_notification_failed", { p_id: job.id, p_error: "job has no appointment_id" });
        summary.skipped += 1;
        continue;
      }

      const manageToken = typeof job.payload === "object" && job.payload && "manageToken" in job.payload
        ? String((job.payload as Record<string, unknown>).manageToken)
        : undefined;
      const context = await loadEmailContext(admin, job.appointment_id, manageToken, siteUrl);
      if (!context) {
        // No email on file (phone-only booking) — nothing to send, not a failure to retry.
        await admin.rpc("mark_notification_sent", { p_id: job.id });
        summary.skipped += 1;
        continue;
      }

      const template =
        job.template === "confirmation" ? confirmationEmail : job.template === "reminder_24h" ? reminderEmail : cancellationEmail;
      const { subject, html } = template(context.ctx);

      await sendEmail(context.to, subject, html);
      await admin.rpc("mark_notification_sent", { p_id: job.id });
      summary.sent += 1;
    } catch (err) {
      await admin.rpc("mark_notification_failed", { p_id: job.id, p_error: err instanceof Error ? err.message : String(err) });
      summary.failed += 1;
    }
  }

  return summary;
}
