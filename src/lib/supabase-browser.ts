// Cliente de navegador: solo para flujos que deben iniciarse en el cliente (OAuth),
// porque disparan una redirección inmediata del propio navegador. Nunca importar
// "server-only" aquí. Usa exclusivamente las credenciales públicas (NEXT_PUBLIC_*).
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
