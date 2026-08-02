"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { createService, setServiceActive, setStaffServices, updateService } from "@/modules/catalog/service";
import { ApiError } from "@/modules/shared/errors";

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  durationMinutes: z.coerce.number().int().min(5).max(600),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(240),
  priceCents: z.coerce.number().int().min(0),
});

function requireOwner(role: string) {
  if (role !== "owner") throw new ApiError("FORBIDDEN");
}

export async function createServiceAction(formData: FormData) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  const input = serviceSchema.parse({
    name: formData.get("name"),
    durationMinutes: formData.get("durationMinutes"),
    bufferAfterMinutes: formData.get("bufferAfterMinutes") ?? 0,
    priceCents: formData.get("priceCents") ?? 0,
  });

  await createService(client, business.businessId, input);
  revalidatePath("/app/servicios");
}

export async function updateServiceAction(serviceId: string, formData: FormData) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  const input = serviceSchema.partial().parse({
    name: formData.get("name") ?? undefined,
    durationMinutes: formData.get("durationMinutes") ?? undefined,
    bufferAfterMinutes: formData.get("bufferAfterMinutes") ?? undefined,
    priceCents: formData.get("priceCents") ?? undefined,
  });

  await updateService(client, serviceId, input);
  revalidatePath("/app/servicios");
}

export async function setServiceActiveAction(serviceId: string, active: boolean) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  await setServiceActive(client, serviceId, active);
  revalidatePath("/app/servicios");
}

export async function setStaffServicesAction(staffId: string, serviceIds: string[]) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  await setStaffServices(client, business.businessId, staffId, serviceIds);
  revalidatePath("/app/servicios");
  revalidatePath("/app/equipo");
}
