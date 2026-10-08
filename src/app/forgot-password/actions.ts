"use server";
import { redirect } from "next/navigation";
import { supabase, isConfigured } from "@/lib/supabase";
import { requestOrigin } from "@/lib/origin";
import { emailOnlySchema } from "@/domain/account";

export async function requestPasswordReset(form: FormData) {
  if (!isConfigured()) redirect("/forgot-password?status=configuration");
  const input = emailOnlySchema.safeParse({ email: form.get("email") });
  if (!input.success) redirect("/forgot-password?status=invalid");
  const db = await supabase();
  const origin = await requestOrigin();
  await db.auth.resetPasswordForEmail(input.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Mismo mensaje exista o no la cuenta: no revela qué correos están registrados.
  redirect("/forgot-password?status=sent");
}
