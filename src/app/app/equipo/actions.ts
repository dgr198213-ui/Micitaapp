"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { createStaff, createTimeOff, deleteTimeOff, setStaffActive, setWorkingHours, type WorkingHoursInput } from "@/modules/resources/service";
import { ApiError } from "@/modules/shared/errors";

function requireOwner(role: string) {
  if (role !== "owner") throw new ApiError("FORBIDDEN");
}

export async function createStaffAction(formData: FormData) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  const displayName = z.string().min(1).max(200).parse(formData.get("displayName"));
  await createStaff(client, business.businessId, displayName);
  revalidatePath("/app/equipo");
}

export async function setStaffActiveAction(staffId: string, active: boolean) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  await setStaffActive(client, staffId, active);
  revalidatePath("/app/equipo");
}

const workingHoursSchema = z.array(
  z.object({ weekday: z.number().int().min(0).max(6), startLocal: z.string(), endLocal: z.string() })
);

export async function setWorkingHoursAction(staffId: string, rows: WorkingHoursInput[]) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  requireOwner(business.role);

  const parsed = workingHoursSchema.parse(rows);
  await setWorkingHours(client, business.businessId, staffId, parsed);
  revalidatePath("/app/equipo");
}

export async function createTimeOffAction(staffId: string, startsAt: string, endsAt: string, reason?: string) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);

  const result = await createTimeOff(client, business.businessId, staffId, startsAt, endsAt, reason);
  revalidatePath("/app/equipo");
  revalidatePath("/app/agenda");
  return result;
}

export async function deleteTimeOffAction(timeOffId: string) {
  const client = await createServerSupabaseClient();
  await deleteTimeOff(client, timeOffId);
  revalidatePath("/app/equipo");
}
