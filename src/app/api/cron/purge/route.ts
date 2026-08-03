import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/modules/shared/cron-auth";
import { logEvent, newRequestId } from "@/modules/shared/log";

/**
 * Retention job (§8.8, §11.3) — missing until the 2026-08-03 audit (V-22). Drops expired
 * idempotency records, clears manage tokens of long-finished appointments (V-07) and
 * trims delivered outbox rows.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const requestId = newRequestId();
  const start = Date.now();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("purge_expired_artifacts");

  if (error) {
    logEvent({ requestId, event: "cron.purge", durationMs: Date.now() - start, outcome: "error", error: error.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  logEvent({ requestId, event: "cron.purge", durationMs: Date.now() - start, outcome: "success", purged: data });
  return NextResponse.json(data);
}
