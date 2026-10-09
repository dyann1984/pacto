import { z } from "zod";
import { supabase, isConfigured } from "@/lib/supabase";
import { requireParticipant } from "@/domain/foundation";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isConfigured())
    return Response.json(
      { error: "CONFIGURATION_REQUIRED" },
      { status: 503, headers },
    );
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const { data: participants, error: membershipError } = await db
    .from("participants")
    .select("pacto_id,user_id,role")
    .eq("pacto_id", id);
  if (membershipError)
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  try {
    requireParticipant(user.id, id, participants ?? []);
  } catch {
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  }
  const { data, error: readError } = await db
    .from("pactos")
    .select("id,title,environment,created_at")
    .eq("id", id)
    .maybeSingle();
  if (readError)
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  if (!data)
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  return Response.json(data, { headers });
}
