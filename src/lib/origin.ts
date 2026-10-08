import "server-only";
import { headers } from "next/headers";

// Origen real de la petición entrante, detrás del proxy de Vercel. Se usa para
// construir enlaces de confirmación de correo y recuperación de contraseña que
// funcionen tanto en Preview como en producción, sin un dominio fijo en el código.
export async function requestOrigin() {
  const h = await headers();
  const direct = h.get("origin");
  if (direct) return direct;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${proto}://${host}`;
}
