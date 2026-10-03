"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createPactoSchema } from "@/domain/foundation";
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
  if (result.error) redirect(`/pactos/${pactoId}?status=failed`);
  revalidatePath(`/pactos/${pactoId}`);
  redirect(`/pactos/${pactoId}`);
}
