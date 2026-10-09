import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
// auth-js reduce cualquier fallo de red a "fetch failed" (status 0) y pierde la
// causa. Se registra en el servidor solo lo técnico (ruta, código de red, estado),
// nunca cuerpos, cabeceras, correos ni contraseñas.
const observedFetch: typeof fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input));
  try {
    const response = await fetch(input, init);
    if (response.status >= 500)
      console.error(`[supabase] ${init?.method ?? "GET"} ${target.pathname} -> HTTP ${response.status}`);
    return response;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    // Cabecera que no se puede codificar (p. ej. una variable de entorno con texto
    // pegado por error): se indica cuál y su longitud, nunca su valor.
    if (/ByteString/.test((error as Error).message) && init?.headers) {
      for (const [name, value] of Object.entries(init.headers as Record<string, string>)) {
        if ([...value].some((c) => c.charCodeAt(0) > 255))
          console.error(`[supabase] cabecera ${name} inválida (len=${value.length}): revisa la variable de entorno que la origina`);
      }
    }
    console.error(
      `[supabase] ${init?.method ?? "GET"} ${target.host}${target.pathname} -> network error: ` +
        `${(error as Error).name}: ${(error as Error).message}` +
        (cause ? ` (cause: ${cause.code ?? ""} ${cause.message ?? ""})` : ""),
    );
    throw error;
  }
};

export function logAuthError(context: string, error: { name?: string; status?: number; code?: string; message?: string }) {
  console.error(
    `[auth] ${context}: ${error.name ?? "Error"} status=${error.status ?? "?"} code=${error.code ?? "?"} message=${error.message ?? ""}`,
  );
}

export async function supabase() {
  if (!isConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: observedFetch },
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
