import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withApiHandler("business.get", async () => {
    const { slug } = await params;

    const rl = await checkRateLimit("business-profile", clientIp(request), 60, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const client = createPublicSupabaseClient();
    const { data: business, error: businessError } = await client
      .from("businesses")
      .select("id, slug, name, timezone, booking_policy")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();

    if (businessError || !business) {
      throw new ApiError("BUSINESS_NOT_FOUND");
    }

    const [{ data: services }, { data: staff }] = await Promise.all([
      client
        .from("services")
        .select("id, name, duration_minutes, buffer_after_minutes, price_cents")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("name"),
      client.from("staff").select("id, display_name").eq("business_id", business.id).eq("active", true).order("display_name"),
    ]);

    return NextResponse.json({
      id: business.id,
      slug: business.slug,
      name: business.name,
      timezone: business.timezone,
      services: services ?? [],
      staff: staff ?? [],
    });
  });
}
