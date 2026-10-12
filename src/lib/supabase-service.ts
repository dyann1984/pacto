import "server-only";
import { createServerClient } from "@supabase/ssr";

/**
 * Si PACTO puede registrar el resultado de un cobro. Una captura de PayPal es un hecho
 * externo que solo afirma el servidor: la RPC la rechaza desde una sesión de usuario, así
 * que sin esta clave un pago se cobraría en PayPal y no podría quedar registrado aquí.
 * Por eso el pago se presenta como «no activado» en vez de dejarlo a medias.
 */
export function isSettlementConfigured() {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

/**
 * Cliente con rol de servicio. Lo usan el webhook de PayPal y el retorno del pagador,
 * que necesitan registrar el resultado de un pago sin una sesión de usuario de por medio.
 *
 * Devuelve null si la clave no está configurada, para que quien lo use falle
 * cerrado en vez de operar a medias. La clave nunca sale de este módulo y jamás
 * se expone al navegador: no lleva el prefijo NEXT_PUBLIC_.
 *
 * Aunque este cliente puede saltarse RLS, solo ejecuta `record_payment_result` y
 * `record_payment_refund`, que aceptan únicamente órdenes ya registradas por PACTO y
 * son idempotentes, y lee `payments.order_id` a partir de una captura para conciliar
 * un reembolso.
 */
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
