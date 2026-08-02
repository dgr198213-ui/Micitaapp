import { notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { BookingWizard } from "./booking-wizard";

export const revalidate = 60; // ISR (§10.1): public business profile, revalidated every 60s

export default async function BusinessBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = createPublicSupabaseClient();

  const { data: business } = await client
    .from("businesses")
    .select("id, slug, name, timezone")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!business) {
    notFound();
  }

  const [{ data: services }, { data: staff }] = await Promise.all([
    client
      .from("services")
      .select("id, name, duration_minutes, price_cents")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name"),
    client.from("staff").select("id, display_name").eq("business_id", business.id).eq("active", true).order("display_name"),
  ]);

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{business.name}</h1>
      <p className="mb-6 text-sm text-gray-500">Reserva tu cita online</p>
      <BookingWizard
        slug={business.slug}
        timezone={business.timezone}
        services={services ?? []}
        staff={staff ?? []}
      />
    </main>
  );
}
