import "server-only";
import { requireSession } from "@/lib/session";
import { requireParticipant } from "@/domain/foundation";
export async function getPacto(id: string) {
  const { db, user } = await requireSession();
  const { data: participants, error: participantError } = await db
    .from("participants")
    .select("pacto_id,user_id,role")
    .eq("pacto_id", id);
  if (participantError) throw new Error("No se pudo consultar la pertenencia.");
  const { data: pacto, error } = await db
    .from("pactos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("No se pudo consultar el Pacto.");
  if (!pacto) return null;
  // Excepción deliberada y de solo lectura: un único Pacto marcado como ejemplo
  // público es visible para cualquier visitante autenticado (incluido modo DEMO),
  // sin ser participante. Respaldada por RLS (is_demo_pacto), no solo por esta
  // comprobación de aplicación.
  if (!pacto.is_demo_example) {
    try {
      requireParticipant(user.id, id, participants ?? []);
    } catch {
      return null;
    }
  }
  const results = await Promise.all([
    db
      .from("agreements")
      .select("*")
      .eq("pacto_id", id)
      .order("version", { ascending: false }),
    db
      .from("audit_events")
      .select("*")
      .eq("pacto_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (results.some((r) => r.error))
    throw new Error("No se pudo consultar el acuerdo o su historial.");
  return {
    pacto,
    participants,
    agreements: results[0].data ?? [],
    events: results[1].data ?? [],
    userId: user.id,
  };
}
