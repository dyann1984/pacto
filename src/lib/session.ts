import "server-only";
import { notFound, redirect } from "next/navigation";
import { isConfigured, supabase } from "./supabase";
export async function requireSession() {
  if (!isConfigured()) redirect("/sign-in?status=configuration");
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/sign-in");
  return { db, user };
}

/**
 * Sesión con rol de administrador. 404, no redirección: no revela que /admin
 * existe a quien no tiene acceso. La usan tanto el layout como la página, de
 * modo que una petición de un no administrador se corta antes de consultar
 * datos administrativos (si no, la consulta falla y ensucia los registros).
 */
export async function requireAdmin() {
  const { db, user } = await requireSession();
  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("No se pudo verificar el rol.");
  if (profile?.role !== "admin") notFound();
  return { db, user };
}
