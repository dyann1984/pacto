"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabase, isConfigured } from "@/lib/supabase";
export async function signIn(form: FormData) {
  if (!isConfigured()) redirect("/sign-in?status=configuration");
  const input = z
    .object({ email: z.email(), password: z.string().min(8).max(128) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) redirect("/sign-in?status=invalid");
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword(input.data);
  if (error) redirect("/sign-in?status=invalid");
  redirect("/pactos");
}
export async function signOut() {
  const db = await supabase();
  const { error } = await db.auth.signOut();
  if (error) throw new Error("No se pudo cerrar la sesión. Intenta de nuevo.");
  redirect("/sign-in");
}
