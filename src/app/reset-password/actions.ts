"use server";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { newPasswordSchema } from "@/domain/account";

export async function updatePassword(form: FormData) {
  // requireSession exige una sesión activa: el enlace de recuperación ya debe
  // haber pasado por /auth/callback y haberla establecido vía cookies.
  const { db } = await requireSession();
  const input = newPasswordSchema.safeParse({
    password: form.get("password"),
    passwordConfirm: form.get("passwordConfirm"),
  });
  if (!input.success) {
    const mismatch = input.error.issues.some((i) => i.message === "PASSWORD_MISMATCH");
    redirect(`/reset-password?status=${mismatch ? "mismatch" : "invalid"}`);
  }
  const { error } = await db.auth.updateUser({ password: input.data.password });
  if (error) redirect("/reset-password?status=failed");
  redirect("/pactos");
}
