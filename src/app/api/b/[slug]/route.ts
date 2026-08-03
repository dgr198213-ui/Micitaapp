import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getBusinessStorefront } from "@/modules/scheduling/storefront";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withApiHandler("business.get", async () => {
    const { slug } = await params;

    const rl = await checkRateLimit("business-profile", clientIp(request), 60, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const client = createPublicSupabaseClient();
    const storefront = await getBusinessStorefront(client, slug);

    return NextResponse.json(storefront);
  });
}
