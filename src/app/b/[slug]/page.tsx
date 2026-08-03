import { notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getBusinessStorefront } from "@/modules/scheduling/storefront";
import { BookingWizard } from "./booking-wizard";

export const revalidate = 60; // ISR (§10.1): public business profile, revalidated every 60s

export default async function BusinessBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = createPublicSupabaseClient();

  const storefront = await getBusinessStorefront(client, slug).catch(() => null);
  if (!storefront) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{storefront.name}</h1>
      <p className="mb-6 text-sm text-gray-500">Reserva tu cita online</p>
      <BookingWizard
        slug={storefront.slug}
        timezone={storefront.timezone}
        services={storefront.services}
        staff={storefront.staff}
      />
    </main>
  );
}
