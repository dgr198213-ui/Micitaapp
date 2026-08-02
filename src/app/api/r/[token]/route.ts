import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getAppointmentByToken } from "@/modules/scheduling/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return withApiHandler("appointment.get_by_token", async () => {
    const { token } = await params;

    const rl = await checkRateLimit("manage-get", clientIp(request), 20, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const client = createPublicSupabaseClient();
    const appointment = await getAppointmentByToken(client, token);

    return NextResponse.json(appointment);
  });
}
