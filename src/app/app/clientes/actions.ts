"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { anonymizeCustomer, updateCustomerNotes } from "@/modules/crm/service";

export async function updateCustomerNotesAction(customerId: string, formData: FormData) {
  const client = await createServerSupabaseClient();
  const notes = z.string().max(2000).parse(formData.get("notes") ?? "");
  await updateCustomerNotes(client, customerId, notes);
  revalidatePath("/app/clientes");
}

export async function anonymizeCustomerAction(customerId: string) {
  const client = await createServerSupabaseClient();
  await anonymizeCustomer(client, customerId);
  revalidatePath("/app/clientes");
}
