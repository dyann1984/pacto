import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { captureOrder, isPayPalConfigured } from "@/lib/paypal";
import { supabaseService } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * Retorno desde PayPal tras la aprobación del pagador. Captura el pago una sola
 * vez: la unicidad de `order_id` y el estado del pago impiden cobros duplicados
 * aunque la persona recargue esta página o vuelva atrás.
 *
 * La captura se registra con el rol de servicio, no con la sesión de quien navega:
 * `record_payment_result` rechaza un 'CAPTURED' declarado desde una sesión de usuario
 * precisamente para que nadie pueda marcar un hito como pagado sin que PayPal haya
 * cobrado. Aquí el servidor ya lo verificó contra PayPal, así que es él quien lo afirma.
 */
export default async function PaymentReturn({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; milestone?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { token: orderId } = await searchParams;
  if (!orderId) redirect(`/pactos/${id}?pago=failed`);
  if (!isPayPalConfigured()) redirect(`/pactos/${id}?pago=no-configurado`);

  const { db } = await requireSession();
  // Solo se captura una orden que este Pacto creó y que sigue abierta; RLS
  // garantiza además que quien consulta participa en el Pacto.
  const { data: payment, error } = await db
    .from("payments")
    .select("id,status,order_id")
    .eq("order_id", orderId)
    .eq("pacto_id", id)
    .maybeSingle();
  if (error || !payment) redirect(`/pactos/${id}?pago=failed`);
  if (payment.status === "CAPTURED") redirect(`/pactos/${id}?pago=pagado`);

  const capture = await captureOrder(orderId);
  if (capture.status !== "OK") {
    if (capture.status === "ERROR") console.error(`[paypal] captureOrder -> ${capture.code}`);
    // Abandonar la propia orden sí lo puede hacer quien la creó, con su sesión.
    await db.rpc("record_payment_result", { p_order_id: orderId, p_status: "FAILED" });
    redirect(`/pactos/${id}?pago=rechazado`);
  }

  // A partir de aquí PayPal YA cobró. Si el registro no se puede escribir, lo honesto es
  // decirlo: el webhook firmado reconciliará el pago, y nunca se afirma un cobro inventado.
  const service = supabaseService();
  if (!service) {
    console.error("[paypal] captura verificada sin conciliación configurada");
    redirect(`/pactos/${id}?pago=conciliacion`);
  }
  const { error: recordError } = await service.rpc("record_payment_result", {
    p_order_id: orderId,
    p_status: "CAPTURED",
    p_capture_id: capture.data.captureId,
  });
  if (recordError) redirect(`/pactos/${id}?pago=conciliacion`);
  redirect(`/pactos/${id}?pago=pagado`);
}
