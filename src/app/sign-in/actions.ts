"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabase, isConfigured } from "@/lib/supabase";
import { requestOrigin } from "@/lib/origin";
import { emailOnlySchema } from "@/domain/account";
export async function signIn(form: FormData) {
  if (!isConfigured()) redirect("/sign-in?status=configuration");
  const input = z
    .object({ email: z.email(), password: z.string().min(8).max(128) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) redirect("/sign-in?status=invalid");
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) {
    // Distingue la causa real sin revelar si el correo existe: "invalid" cubre
    // tanto correo inexistente como contraseña incorrecta (mismo mensaje, por
    // diseño, para no permitir enumerar cuentas). Las demás causas sí se separan
    // porque quien las ve ya demostró ser dueño de ese intento de acceso.
    if (error.code === "email_not_confirmed") redirect("/sign-in?status=unconfirmed");
    if (error.status === 429 || error.code === "over_request_rate_limit")
      redirect("/sign-in?status=rate-limited");
    if (error.code === "invalid_credentials") redirect("/sign-in?status=invalid");
    redirect("/sign-in?status=failed");
  }
  redirect("/pactos");
}
export async function resendConfirmation(form: FormData) {
  if (!isConfigured()) redirect("/sign-in?status=configuration");
  const input = emailOnlySchema.safeParse({ email: form.get("email") });
  if (!input.success) redirect("/sign-in?status=invalid");
  const db = await supabase();
  const origin = await requestOrigin();
  await db.auth.resend({
    type: "signup",
    email: input.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/pactos` },
  });
  // Mismo mensaje exista o no la cuenta, o ya esté confirmada: no revela estado de cuentas.
  redirect("/sign-in?status=resent");
}
export async function signOut() {
  const db = await supabase();
  const { error } = await db.auth.signOut();
  if (error) throw new Error("No se pudo cerrar la sesión. Intenta de nuevo.");
  redirect("/sign-in");
}
