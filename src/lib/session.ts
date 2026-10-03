import "server-only";
import { redirect } from "next/navigation";
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
