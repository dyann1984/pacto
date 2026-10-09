// Punto único de intercambio de código PKCE: confirmación de correo, recuperación
// de contraseña y OAuth (Google) llegan todos aquí con ?code=...&next=/ruta.
import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/pactos";
  // Solo rutas internas: nunca redirigir a un destino arbitrario provisto por la URL.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/pactos";

  if (code && isConfigured()) {
    const db = await supabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/sign-in?status=invalid`);
}
