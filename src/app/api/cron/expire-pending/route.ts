import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/modules/shared/cron-auth";
import { logEvent, newRequestId } from "@/modules/shared/log";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const requestId = newRequestId();
  const start = Date.now();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("expire_pending_appointments");

  if (error) {
    logEvent({ requestId, event: "cron.expire_pending", durationMs: Date.now() - start, outcome: "error", error: error.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  logEvent({ requestId, event: "cron.expire_pending", durationMs: Date.now() - start, outcome: "success", expired: data });
  return NextResponse.json({ expired: data });
}
