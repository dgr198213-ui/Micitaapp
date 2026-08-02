import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { listServices } from "@/modules/catalog/service";
import { listStaff } from "@/modules/resources/service";
import { AgendaClient, type AgendaAppointment } from "./agenda-client";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);

  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);

  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;

  const [{ data: appointments }, services, staff] = await Promise.all([
    client
      .from("appointments")
      .select("id, starts_at, ends_at, status, notes, customers(name, phone), services(name), staff(display_name), staff_id")
      .eq("business_id", business.businessId)
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .order("starts_at")
      .returns<AgendaAppointment[]>(),
    listServices(client, business.businessId),
    listStaff(client, business.businessId),
  ]);

  return (
    <AgendaClient
      businessId={business.businessId}
      day={day}
      initialAppointments={appointments ?? []}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      staff={staff.map((s) => ({ id: s.id, name: s.display_name }))}
    />
  );
}
