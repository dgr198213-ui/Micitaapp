"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const passwordSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const magicLinkSchema = z.object({ email: z.string().email() });

export async function signInWithPasswordAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { error: "Email o contraseña inválidos." };
  }

  const client = await createServerSupabaseClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "No se pudo iniciar sesión. Revisa tus datos." };
  }

  redirect("/app/agenda");
}

export async function sendMagicLinkAction(formData: FormData): Promise<{ error?: string; sent?: boolean }> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Introduce un email válido." };
  }

  const client = await createServerSupabaseClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await client.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });
  if (error) {
    return { error: "No se pudo enviar el enlace de acceso." };
  }

  return { sent: true };
}

export async function signOutAction() {
  const client = await createServerSupabaseClient();
  await client.auth.signOut();
  redirect("/login");
}
