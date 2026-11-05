import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/supabase";
import { supabaseService } from "@/lib/supabase-service";
import { verifyWebhook } from "@/lib/paypal";

export const dynamic = "force-dynamic";

type Link = { rel?: string; href?: string };
type Resource = {
  id?: string;
  links?: Link[];
  supplementary_data?: { related_ids?: { order_id?: string } };
};

// Eventos que cambian un estado. Cualquier otro se reconoce sin tocar nada.
const CAPTURE_STATUS: Record<string, "CAPTURED" | "FAILED"> = {
  "PAYMENT.CAPTURE.COMPLETED": "CAPTURED",
  // Orders v2 publica DENIED; la referencia de Payments v2 nombra DECLINED. Ambos son un
  // cobro que no se produjo.
  "PAYMENT.CAPTURE.DENIED": "FAILED",
  "PAYMENT.CAPTURE.DECLINED": "FAILED",
};
const REFUND_EVENTS = new Set(["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"]);

/** La captura a la que apunta un reembolso: el enlace `up` (…/v2/payments/captures/{id}). */
function captureIdFromLinks(links?: Link[]) {
  const up = links?.find((l) => l.rel === "up" && l.href?.includes("/captures/"));
  return up?.href?.match(/\/captures\/([A-Za-z0-9-]{3,128})/)?.[1];
}

/**
 * Avisos de PayPal Sandbox. Fuente de verdad secundaria para la captura (la normal ocurre
 * en el retorno del pagador; este webhook cubre que esa vuelta se pierda o que la captura
 * quede pendiente) y única para los reembolsos.
 *
 * Falla cerrado: sin firma válida de PayPal no se toca nada. El aviso llega sin sesión de
 * usuario, así que escribe el rol de servicio mediante RPC idempotentes que solo aceptan
 * órdenes ya registradas por PACTO. Nunca se registra el cuerpo del aviso.
 */
export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ received: true }, { status: 200 });
  const raw = await request.text();

  if (!(await verifyWebhook(request.headers, raw))) {
    console.error("[paypal] webhook rechazado: firma no verificada");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event_type?: string; resource?: Resource };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const type = event.event_type ?? "";
  const resource = event.resource ?? {};
  const status = CAPTURE_STATUS[type] ?? null;
  const isRefund = REFUND_EVENTS.has(type);
  // Los avisos informativos (orden aprobada, captura pendiente…) no cambian ningún estado.
  if (!status && !isRefund) return NextResponse.json({ received: true }, { status: 200 });

  // Sin sesión de usuario, la única vía de escritura es el rol de servicio. Si no está
  // configurado, el aviso se reconoce pero no cambia nada.
  const db = supabaseService();
  if (!db) {
    console.error(`[paypal] webhook ${type}: conciliación no configurada`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const orderId = resource.supplementary_data?.related_ids?.order_id;
  // El recurso de PAYMENT.CAPTURE.REFUNDED es el propio reembolso y no trae order_id (así
  // llega de PayPal Sandbox): solo enlaza a la captura con rel "up". En una reversión el
  // recurso es la captura misma. La base traduce captura -> orden: el rol de servicio no
  // lee `payments` directamente, a propósito.
  const captureId = isRefund && !orderId ? (captureIdFromLinks(resource.links) ?? resource.id) : undefined;
  if (!orderId && !captureId) {
    console.error(`[paypal] webhook ${type}: no se identificó la orden`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { error } = isRefund
    ? orderId
      ? await db.rpc("record_payment_refund", { p_order_id: orderId, p_refund_id: resource.id ?? null })
      : await db.rpc("record_payment_refund_by_capture", { p_capture_id: captureId, p_refund_id: resource.id ?? null })
    : await db.rpc("record_payment_result", {
        p_order_id: orderId,
        p_status: status,
        p_capture_id: status === "CAPTURED" ? (resource.id ?? null) : null,
      });
  if (error) {
    console.error(`[paypal] webhook ${type}: no se pudo registrar el resultado`);
    // 200 de todos modos: PayPal reintenta ante un error, y un reintento infinito no
    // ayudaría. Las RPC son idempotentes si el aviso se repite.
  }
  return NextResponse.json({ received: true }, { status: 200 });
}
