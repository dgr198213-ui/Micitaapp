import { NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export async function GET() {
  const client = createPublicSupabaseClient();
  const { error } = await client.from("businesses").select("id").limit(1);

  if (error) {
    return NextResponse.json({ status: "down", db: false }, { status: 503 });
  }
  return NextResponse.json({ status: "ok", db: true });
}
