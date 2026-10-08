"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createPactoSchema } from "@/domain/foundation";
import { analyzeAgreement } from "@/lib/ai";

// Códigos de negocio que levanta PostgreSQL; cualquier otro error se reporta como "failed".
const knownActionCodes = [
  "PENDING_PROPOSAL",
  "PACTO_NOT_ACTIVE",
  "INVALID_INPUT",
  "INVALID_STATE",
  "NOT_FOUND",
] as const;

function actionErrorCode(message: string | undefined) {
  return knownActionCodes.find((code) => message?.includes(code)) ?? "failed";
}
export async function createPacto(form: FormData) {
  const { db } = await requireSession();
  const raw = String(form.get("amount") ?? "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw))
    redirect("/pactos/new?status=invalid");
  const [whole, fraction = ""] = raw.split(".");
  const input = createPactoSchema.safeParse({
    title: form.get("title"),
    scope: form.get("scope"),
    totalCents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
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
    .enum(["seller", "submit", "accept", "revise"])
    .parse(form.get("operation"));
  let result;
  if (operation === "seller") {
    if (participant.role !== "BUYER") throw new Error("NOT_FOUND");
    result = await db.rpc("add_seller", {
      p_id: pactoId,
      p_user_id: z.uuid().parse(form.get("sellerId")),
    });
  } else {
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
      const total = z.coerce
        .number()
        .int()
        .min(100)
        .max(100000000)
        .parse(form.get("totalCents"));
      result = await db.rpc("revise_agreement", {
        a_id: agreementId,
        p_scope: scope,
        p_total_cents: total,
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

  let outcome;
  try {
    outcome = await analyzeAgreement({
      scope: agreement.scope,
      totalCents: agreement.total_cents,
      milestones: milestones ?? [],
    });
  } catch {
    redirect(`/pactos/${pactoId}?ai=failed`);
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
