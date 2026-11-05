"use server";
import { redirect } from "next/navigation";
import { supabase, isConfigured } from "@/lib/supabase";
import { requestOrigin } from "@/lib/origin";
import { signUpSchema } from "@/domain/account";
import { isEmailRateLimited } from "@/lib/auth-errors";

export async function signUp(form: FormData) {
  if (!isConfigured()) redirect("/sign-up?status=configuration");
  const input = signUpSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    passwordConfirm: form.get("passwordConfirm"),
  });
  if (!input.success) {
    const mismatch = input.error.issues.some((i) => i.message === "PASSWORD_MISMATCH");
    redirect(`/sign-up?status=${mismatch ? "mismatch" : "invalid"}`);
  }
  const db = await supabase();
  const origin = await requestOrigin();
  // El rol se asigna exclusivamente por trigger de base de datos (siempre 'user');
  // ningún dato de este formulario puede influir en permisos.
  const { data, error } = await db.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/pactos` },
  });
  if (error) {
    if (/already registered|user_already_exists/i.test(error.message))
      redirect("/sign-up?status=exists");
    // Agotar el cupo de correo no es una avería: se arregla esperando, y la
    // DEMO sigue disponible sin correo. Decirlo cambia lo que hace la persona.
    if (isEmailRateLimited(error)) redirect("/sign-up?status=email-rate-limit");
    redirect("/sign-up?status=failed");
  }
  // Si la confirmación de correo está desactivada en el proyecto, Supabase ya
  // entrega una sesión; en ese caso se puede ir directo a la app.
  if (data.session) redirect("/pactos");
  redirect("/sign-in?status=check-email");
}
