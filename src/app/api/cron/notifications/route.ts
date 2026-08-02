import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/modules/shared/cron-auth";
import { dispatchDueNotifications } from "@/modules/notifications/dispatch";
import { logEvent, newRequestId } from "@/modules/shared/log";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const requestId = newRequestId();
  const start = Date.now();
  try {
    const admin = createAdminSupabaseClient();
    const summary = await dispatchDueNotifications(admin);
    logEvent({ requestId, event: "cron.dispatch_notifications", durationMs: Date.now() - start, outcome: "success", ...summary });
    return NextResponse.json(summary);
  } catch (err) {
    logEvent({
      requestId,
      event: "cron.dispatch_notifications",
      durationMs: Date.now() - start,
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
