import "server-only";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente con rol de servicio. Único uso previsto: el webhook de PayPal, que
 * llega sin sesión de usuario y necesita registrar el resultado de un pago.
 *
 * Devuelve null si la clave no está configurada, para que quien lo use falle
 * cerrado en vez de operar a medias. La clave nunca sale de este módulo y jamás
 * se expone al navegador: no lleva el prefijo NEXT_PUBLIC_.
 *
 * Aunque este cliente puede saltarse RLS, la única función que ejecuta es
 * `record_payment_result`, que solo acepta órdenes ya registradas por PACTO y
 * es idempotente.
 */
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
