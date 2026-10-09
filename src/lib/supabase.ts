import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function supabase() {
  if (!isConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server Components cannot write cookies; proxy refreshes them. */
          }
        },
      },
    },
  );
}

// Consulta pública y sin autenticar de Supabase (no requiere sesión ni clave privada).
// Permite no presentar "Continuar con Google" como funcional mientras el proveedor
// esté deshabilitado en el proyecto, en vez de dejar que el usuario lo descubra al fallar.
export async function isGoogleOAuthEnabled(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { external?: { google?: boolean } };
    return data.external?.google === true;
  } catch {
    // Falla cerrado: ante cualquier error de red, se trata como deshabilitado.
    return false;
  }
}
