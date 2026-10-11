import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/supabase";
import { supabaseService } from "@/lib/supabase-service";
import { verifyWebhook } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * Avisos de PayPal Sandbox. Fuente de verdad secundaria: la captura normal ocurre
 * en el retorno del pagador, y este webhook cubre el caso de que esa vuelta se
 * pierda (cierre del navegador, red caída).
 *
 * Falla cerrado: sin firma válida de PayPal no se toca nada. El aviso llega sin
 * sesión de usuario, así que se usa un cliente sin cookies; la escritura la hace
 * la RPC `record_payment_result`, que es idempotente y solo acepta órdenes ya
 * registradas por PACTO. Nunca se registra el cuerpo del aviso.
 */
export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ received: true }, { status: 200 });
  const raw = await request.text();

  if (!(await verifyWebhook(request.headers, raw))) {
    console.error("[paypal] webhook rechazado: firma no verificada");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const type = event.event_type ?? "";
  const orderId =
    type === "CHECKOUT.ORDER.APPROVED"
      ? event.resource?.id
      : event.resource?.supplementary_data?.related_ids?.order_id;
  if (!orderId) return NextResponse.json({ received: true }, { status: 200 });

  // Un reembolso o una reversión devuelven el dinero al cliente: el hito deja de constar
  // como pagado. Antes `REVERSED` se trataba como fallo y, al estar ya capturado, la RPC
  // devolvía ALREADY_CAPTURED sin cambiar ni auditar nada.
  const isRefund =
    type === "PAYMENT.CAPTURE.REFUNDED" || type === "PAYMENT.CAPTURE.REVERSED";
  const status =
    type === "PAYMENT.CAPTURE.COMPLETED"
      ? "CAPTURED"
      : type === "PAYMENT.CAPTURE.DENIED"
        ? "FAILED"
        : null;
  // Los avisos informativos (orden aprobada, por ejemplo) no cambian ningún estado.
  if (!status && !isRefund) return NextResponse.json({ received: true }, { status: 200 });

  // Sin sesión de usuario, la única vía de escritura es el rol de servicio. Si no
  // está configurado, el aviso se reconoce pero no cambia nada: la captura normal
  // ya ocurre en el retorno del pagador.
  const db = supabaseService();
  if (!db) {
    console.error(`[paypal] webhook ${type}: conciliación no configurada`);
    return NextResponse.json({ received: true }, { status: 200 });
  }
  const { error } = isRefund
    ? await db.rpc("record_payment_refund", {
        p_order_id: orderId,
        p_refund_id: event.resource?.id ?? null,
      })
    : await db.rpc("record_payment_result", {
        p_order_id: orderId,
        p_status: status,
        p_capture_id: type === "PAYMENT.CAPTURE.COMPLETED" ? (event.resource?.id ?? null) : null,
      });
  if (error) {
    console.error(`[paypal] webhook ${type}: no se pudo registrar el resultado`);
    // 200 de todos modos: PayPal reintenta ante un error, y el retorno del
    // pagador ya cubre el caso normal. Un reintento infinito no ayudaría.
  }
  return NextResponse.json({ received: true }, { status: 200 });
}
