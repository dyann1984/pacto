"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createPactoSchema } from "@/domain/foundation";
import { analyzeAgreement } from "@/lib/ai";
import { classifyAnalysisError } from "@/domain/agreement-analysis";
import { requestOrigin } from "@/lib/origin";
import { createOrder, isPayPalConfigured } from "@/lib/paypal";
import { isSettlementConfigured } from "@/lib/supabase-service";

// Códigos de negocio que levanta PostgreSQL; cualquier otro error se reporta como "failed".
const knownActionCodes = [
  "PENDING_PROPOSAL",
  "PACTO_NOT_ACTIVE",
  "INVALID_INPUT",
  "INVALID_STATE",
  "DELIVERY_REQUIRED",
  "NOT_FOUND",
] as const;

function actionErrorCode(message: string | undefined) {
  return knownActionCodes.find((code) => message?.includes(code)) ?? "failed";
}

// Importe escrito por la persona en pesos ("1500" o "1500.50") a centavos; null si no es válido.
function amountToCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function createPacto(form: FormData) {
  const { db } = await requireSession();
  const totalCents = amountToCents(form.get("amount"));
  if (totalCents === null) redirect("/pactos/new?status=invalid");
  const input = createPactoSchema.safeParse({
    title: form.get("title"),
    scope: form.get("scope"),
    totalCents,
    environment: "DEMO",
  });
  if (!input.success) redirect("/pactos/new?status=invalid");
  const { data, error } = await db.rpc("create_pacto", {
    p_title: input.data.title,
    p_scope: input.data.scope,
    p_total_cents: input.data.totalCents,
    p_environment: input.data.environment,
  });
  if (error) redirect("/pactos/new?status=failed");
  revalidatePath("/pactos");
  redirect(`/pactos/${data}`);
}
export async function updatePacto(form: FormData) {
  const { db, user } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const { data: participant, error: membershipError } = await db
    .from("participants")
    .select("role")
    .eq("pacto_id", pactoId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !participant) throw new Error("NOT_FOUND");
  const operation = z
    .enum(["submit", "accept", "revise"])
    .parse(form.get("operation"));
  let result;
  {
    const agreementId = z.uuid().parse(form.get("agreementId"));
    const { data: agreement } = await db
      .from("agreements")
      .select("id")
      .eq("id", agreementId)
      .eq("pacto_id", pactoId)
      .maybeSingle();
    if (!agreement) throw new Error("NOT_FOUND");
    if (operation === "revise") {
      const scope = z
        .string()
        .trim()
        .min(10)
        .max(5000)
        .parse(form.get("scope"));
      const total = z
        .number()
        .int()
        .min(100)
        .max(100000000)
        .safeParse(amountToCents(form.get("amount")));
      if (!total.success) redirect(`/pactos/${pactoId}?status=INVALID_AMOUNT`);
      result = await db.rpc("revise_agreement", {
        a_id: agreementId,
        p_scope: scope,
        p_total_cents: total.data,
      });
    } else
      result = await db.rpc(
        operation === "submit" ? "submit_agreement" : "accept_agreement",
        { a_id: agreementId },
      );
  }
  if (result.error)
    redirect(`/pactos/${pactoId}?status=${actionErrorCode(result.error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}`);
}

export async function confirmClosure(form: FormData) {
  const { db } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const note = z.string().trim().max(500).parse(form.get("note") ?? "");
  const { data, error } = await db.rpc("confirm_closure", {
    p_id: pactoId,
    p_note: note,
  });
  if (error)
    redirect(`/pactos/${pactoId}?status=${actionErrorCode(error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}?status=${data === "CLOSED" ? "closed" : "confirmed"}`);
}

export async function cancelPacto(form: FormData) {
  const { db } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const reason = z.string().trim().min(10).max(500).safeParse(form.get("reason"));
  if (!reason.success) redirect(`/pactos/${pactoId}?status=INVALID_INPUT`);
  const { error } = await db.rpc("cancel_pacto", {
    p_id: pactoId,
    p_reason: reason.data,
  });
  if (error)
    redirect(`/pactos/${pactoId}?status=${actionErrorCode(error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}?status=cancelled`);
}

export type InvitationState =
  | { status: "idle" }
  | { status: "ok"; link: string; email: string | null }
  | { status: "error"; message: string };

const invitationErrors: Record<string, string> = {
  SELLER_ALREADY_JOINED: "Tu proveedor ya se unió a este Pacto.",
  PACTO_NOT_ACTIVE: "Este Pacto ya no está activo.",
  INVALID_INPUT: "Revisa el correo electrónico del proveedor.",
};

// Enlace de un solo uso para que el proveedor se una. El token solo existe en esta
// respuesta: no viaja en la URL de la página del comprador ni queda en registros.
export async function createInvitation(
  _previous: InvitationState,
  form: FormData,
): Promise<InvitationState> {
  const { db } = await requireSession();
  const pactoId = z.uuid().safeParse(form.get("pactoId"));
  if (!pactoId.success) return { status: "error", message: "No se encontró el Pacto." };
  const email = z
    .union([z.literal(""), z.email().max(254)])
    .safeParse(String(form.get("email") ?? "").trim());
  if (!email.success)
    return { status: "error", message: invitationErrors.INVALID_INPUT };
  const { data, error } = await db.rpc("create_invitation", {
    p_id: pactoId.data,
    p_email: email.data || null,
  });
  if (error || typeof data !== "string") {
    const code = Object.keys(invitationErrors).find((c) => error?.message?.includes(c));
    return {
      status: "error",
      message: code
        ? invitationErrors[code]
        : "No se pudo generar la invitación. Intenta de nuevo en unos minutos.",
    };
  }
  revalidatePath(`/pactos/${pactoId.data}`);
  return {
    status: "ok",
    link: `${await requestOrigin()}/invitacion/${data}`,
    email: email.data || null,
  };
}

export async function acceptInvitation(form: FormData) {
  const token = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse(form.get("token"));
  if (!token.success) redirect("/pactos");
  const { db } = await requireSession();
  const { data, error } = await db.rpc("accept_invitation", { p_token: token.data });
  if (error) {
    const code =
      [
        "INVITATION_USED",
        "INVITATION_EXPIRED",
        "INVITATION_EMAIL_MISMATCH",
        "DISTINCT_PARTIES_REQUIRED",
        "SELLER_ALREADY_JOINED",
        "PACTO_NOT_ACTIVE",
        "INVALID_STATE",
      ].find((c) => error.message?.includes(c)) ?? "failed";
    redirect(`/invitacion/${token.data}?error=${code}`);
  }
  revalidatePath(`/pactos/${data}`);
  redirect(`/pactos/${data}?status=joined`);
}

const AI_ANALYSES_PER_VERSION = 3;
// Topes de gasto: por persona (una evaluación completa usa 1-3) y globales, porque abrir
// otra sesión anónima esquiva el tope personal. Ver 202610160001_ai_quota.sql.
const AI_ANALYSES_PER_USER_PER_DAY = 6;
const AI_ANALYSES_GLOBAL_PER_HOUR = 60;

const milestoneErrors = [
  "EVIDENCE_REQUIRED",
  "APPROVAL_REQUIRED",
  "AMOUNT_MISMATCH",
  "PAYMENT_ALREADY_OPEN",
  "CAPTURE_NOT_ALLOWED",
  "INVALID_TRANSITION",
  "INVALID_INPUT",
  "INVALID_STATE",
  "PACTO_NOT_ACTIVE",
] as const;

function milestoneErrorCode(message: string | undefined) {
  return milestoneErrors.find((code) => message?.includes(code)) ?? "failed";
}

/** El proveedor presenta evidencia de cumplimiento de un hito. */
export async function submitEvidence(form: FormData) {
  const { db } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const milestoneId = z.uuid().parse(form.get("milestoneId"));
  const evidence = z.string().trim().min(10).max(2000).safeParse(form.get("evidence"));
  if (!evidence.success) redirect(`/pactos/${pactoId}?pago=INVALID_INPUT`);
  const { error } = await db.rpc("submit_milestone_evidence", {
    m_id: milestoneId,
    p_evidence: evidence.data,
  });
  if (error) redirect(`/pactos/${pactoId}?pago=${milestoneErrorCode(error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}?pago=evidencia`);
}

/** El cliente revisa y autoriza el hito. Es la aprobación humana previa al pago. */
export async function approveMilestone(form: FormData) {
  const { db } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const milestoneId = z.uuid().parse(form.get("milestoneId"));
  const { error } = await db.rpc("approve_milestone", { m_id: milestoneId });
  if (error) redirect(`/pactos/${pactoId}?pago=${milestoneErrorCode(error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}?pago=aprobado`);
}

/**
 * Crea la orden en PayPal Sandbox y lleva al cliente a aprobarla en PayPal.
 * El importe no viene del formulario: se lee del hito en la base, y la RPC
 * vuelve a comprobar que coincide. Así un formulario manipulado no cambia nada.
 */
export async function startPayment(form: FormData) {
  const { db } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const milestoneId = z.uuid().parse(form.get("milestoneId"));
  // No se abre un cobro que después no se podría registrar: sin conciliación, PayPal
  // cobraría y el hito quedaría sin constancia. Ver isSettlementConfigured.
  if (!isPayPalConfigured() || !isSettlementConfigured())
    redirect(`/pactos/${pactoId}?pago=no-configurado`);

  const { data: milestone, error: milestoneError } = await db
    .from("milestones")
    .select("id,title,amount_cents,status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (milestoneError || !milestone) redirect(`/pactos/${pactoId}?pago=failed`);
  if (milestone.status !== "APPROVED") redirect(`/pactos/${pactoId}?pago=APPROVAL_REQUIRED`);

  const origin = await requestOrigin();
  // Clave de idempotencia por intento, no por hito: con la del hito, un reintento tras
  // cancelar o tras un reembolso recibía de PayPal la orden antigua. Los dobles clics ya
  // los frena la base (un solo pago vivo por hito).
  const order = await createOrder(
    {
      amountCents: milestone.amount_cents,
      currency: "MXN",
      reference: milestone.id,
      description: `PACTO · ${milestone.title}`,
      returnUrl: `${origin}/pactos/${pactoId}/pago?milestone=${milestone.id}`,
      // PayPal añade `token=<orderId>`: el retorno cierra la orden cancelada.
      cancelUrl: `${origin}/pactos/${pactoId}/pago?cancelado=1`,
    },
    fetch,
    `${milestone.id}-${randomUUID()}`,
  );
  if (order.status === "NOT_CONFIGURED") redirect(`/pactos/${pactoId}?pago=no-configurado`);
  if (order.status === "ERROR") {
    console.error(`[paypal] createOrder -> ${order.code}`);
    redirect(`/pactos/${pactoId}?pago=proveedor`);
  }

  const { error } = await db.rpc("record_payment_order", {
    m_id: milestoneId,
    p_order_id: order.data.orderId,
    p_amount_cents: milestone.amount_cents,
  });
  if (error) redirect(`/pactos/${pactoId}?pago=${milestoneErrorCode(error.message)}`);
  revalidatePath(`/pactos/${pactoId}`);
  // Aprobación explícita del pagador: la hace la persona dentro de PayPal.
  redirect(order.data.approveUrl);
}

// Asistencia de IA: solo lectura del acuerdo. Nunca cambia estados ni importes.
export async function runAgreementAnalysis(form: FormData) {
  const { db, user } = await requireSession();
  const pactoId = z.uuid().parse(form.get("pactoId"));
  const agreementId = z.uuid().parse(form.get("agreementId"));
  const { data: participant, error: membershipError } = await db
    .from("participants")
    .select("role")
    .eq("pacto_id", pactoId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !participant) throw new Error("NOT_FOUND");
  const { data: agreement, error: agreementError } = await db
    .from("agreements")
    .select("id,scope,total_cents")
    .eq("id", agreementId)
    .eq("pacto_id", pactoId)
    .maybeSingle();
  if (agreementError || !agreement) throw new Error("NOT_FOUND");
  const { data: milestones, error: milestoneError } = await db
    .from("milestones")
    .select("title,amount_cents,sequence")
    .eq("agreement_id", agreementId)
    .order("sequence");
  if (milestoneError) redirect(`/pactos/${pactoId}?ai=failed`);
  // Tope de coste: cada llamada al proveedor se paga, y cualquier visitante DEMO puede pulsar.
  const { count, error: countError } = await db
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("agreement_id", agreementId);
  if (countError) redirect(`/pactos/${pactoId}?ai=failed`);
  if ((count ?? 0) >= AI_ANALYSES_PER_VERSION) redirect(`/pactos/${pactoId}?ai=limit`);
  // Cupo por persona y global, antes de gastar nada. Sin poder consultarlo no se analiza.
  const { data: quotaRows, error: quotaError } = await db.rpc("ai_quota");
  const quota = (quotaRows as { mine_24h: number; all_1h: number }[] | null)?.[0];
  if (quotaError || !quota) redirect(`/pactos/${pactoId}?ai=failed`);
  if (quota.all_1h >= AI_ANALYSES_GLOBAL_PER_HOUR) redirect(`/pactos/${pactoId}?ai=cupo-global`);
  if (quota.mine_24h >= AI_ANALYSES_PER_USER_PER_DAY) redirect(`/pactos/${pactoId}?ai=cupo`);

  let outcome;
  try {
    outcome = await analyzeAgreement({
      scope: agreement.scope,
      totalCents: agreement.total_cents,
      milestones: milestones ?? [],
    });
  } catch (error) {
    // Cada causa tiene un remedio distinto (esperar, reintentar o avisar a quien administra);
    // confundirlas lleva a reintentar en bucle o a creer que el acuerdo tiene un problema.
    const failure = classifyAnalysisError(error);
    // Solo el código: nunca el cuerpo del proveedor ni la clave.
    console.error(`[ia] análisis fallido: ${failure} (${(error as Error)?.message ?? "sin mensaje"})`);
    redirect(`/pactos/${pactoId}?ai=${failure}`);
  }
  if (outcome.status === "NOT_CONFIGURED")
    redirect(`/pactos/${pactoId}?ai=not-configured`);

  const { error } = await db.rpc("record_ai_analysis", {
    a_id: agreementId,
    p_model: outcome.model,
    p_input_sha256: outcome.inputSha256,
    p_result: outcome.result,
  });
  if (error) redirect(`/pactos/${pactoId}?ai=failed`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}?ai=done`);
}
