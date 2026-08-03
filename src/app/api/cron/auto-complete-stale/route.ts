import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/modules/shared/cron-auth";
import { logEvent, newRequestId } from "@/modules/shared/log";

// V-14 (option A): stale confirmed appointments are auto-closed as 'completed', never
// 'no_show' — that is now an exclusively manual action from the agenda panel.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const requestId = newRequestId();
  const start = Date.now();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("auto_complete_stale_appointments");

  if (error) {
    logEvent({ requestId, event: "cron.auto_complete_stale", durationMs: Date.now() - start, outcome: "error", error: error.message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  logEvent({ requestId, event: "cron.auto_complete_stale", durationMs: Date.now() - start, outcome: "success", completed: data });
  return NextResponse.json({ completed: data });
}
