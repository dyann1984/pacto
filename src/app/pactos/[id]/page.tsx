import { notFound } from "next/navigation";
import { z } from "zod";
import { getPacto } from "@/application/pactos";
import { updatePacto } from "../actions";
export default async function Center({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getPacto(id);
  if (!detail) notFound();
  const { pacto, participants, agreements, events, userId } = detail;
  const current = agreements[0];
  const { status } = await searchParams;
  const { db } = await import("@/lib/session").then((m) => m.requireSession());
  const { data: acceptances, error: acceptanceError } = await db
    .from("acceptances")
    .select("user_id,accepted_at")
    .eq("agreement_id", current.id);
  if (acceptanceError)
    throw new Error("No se pudieron consultar las aceptaciones.");
  const { data: milestones, error: milestoneError } = await db
    .from("milestones")
    .select("*")
    .eq("agreement_id", current.id);
  if (milestoneError) throw new Error("No se pudieron consultar los hitos.");
  const isBuyer = participants?.some(
    (p) => p.user_id === userId && p.role === "BUYER",
  );
  function fields(operation: string) {
    return (
      <>
        <input type="hidden" name="pactoId" value={id} />
        <input type="hidden" name="agreementId" value={current.id} />
        <input type="hidden" name="operation" value={operation} />
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMMAND CENTER · DEMO</span>
          <h1>{pacto.title}</h1>
          <p>Alcance, participantes y decisiones del acuerdo.</p>
        </div>
        <span className="badge">
          {current.state} · v{current.version}
        </span>
      </div>
      {status && (
        <div className="notice" role="alert">
          No se pudo completar la acción. Revisa el estado del acuerdo e intenta
          de nuevo.
        </div>
      )}
      <div className="journey">
        <span className="active">01 Acuerdo</span>
        <span>02 Evidencia · Próxima fase</span>
        <span>03 IA · Próxima fase</span>
        <span>04 PayPal · Próxima fase</span>
      </div>
      <div className="center-grid">
        <section className="card agreement-card">
          <div className="card-heading">
            <h2>Resumen del acuerdo</h2>
            <span className="badge">DEMO</span>
          </div>
          <div className="amount">
            {new Intl.NumberFormat("es-MX", {
              style: "currency",
              currency: "MXN",
            }).format(current.total_cents / 100)}{" "}
            <small>MXN</small>
          </div>
          <p className="scope">{current.scope}</p>
          <h3>Entrega acordada</h3>
          {milestones?.map((m) => (
            <div className="milestone" key={m.id}>
              <span className="milestone-dot" />
              <div>
                <strong>{m.title}</strong>
                <p>Definida en el alcance vigente</p>
              </div>
              <span>
                {new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: "MXN",
                }).format(m.amount_cents / 100)}
              </span>
            </div>
          ))}
          <p className="fine-print">
            {acceptances?.length ?? 0}/2 aceptaciones de esta versión. Aceptar
            el acuerdo no ejecuta pagos.
          </p>
          {current.state === "DRAFT" && (
            <form action={updatePacto}>
              {fields("submit")}
              <button className="button" disabled={participants?.length !== 2}>
                Enviar a revisión →
              </button>
            </form>
          )}
          {current.state === "REVIEW" &&
            !acceptances?.some((a) => a.user_id === userId) && (
              <form action={updatePacto}>
                {fields("accept")}
                <button className="button">
                  Aceptar versión {current.version} →
                </button>
              </form>
            )}
          <details className="revision">
            <summary>
              {current.state === "ACCEPTED"
                ? "Proponer nueva versión"
                : "Editar borrador"}
            </summary>
            <form action={updatePacto}>
              {fields("revise")}
              <label>
                Alcance
                <textarea
                  name="scope"
                  defaultValue={current.scope}
                  minLength={10}
                  maxLength={5000}
                  rows={4}
                  required
                />
              </label>
              <label>
                Importe en centavos MXN
                <input
                  name="totalCents"
                  type="number"
                  min={100}
                  max={100000000}
                  defaultValue={current.total_cents}
                  required
                />
              </label>
              <p className="fine-print">
                Una edición requiere nuevas aceptaciones. Las versiones
                aceptadas se conservan.
              </p>
              <button className="button">Guardar versión</button>
            </form>
          </details>
        </section>
        <section className="card">
          <h2>Participantes</h2>
          {participants?.map((p) => (
            <div className="participant" key={p.user_id}>
              <span className="avatar">{p.role === "BUYER" ? "C" : "V"}</span>
              <div>
                <strong>
                  {p.role === "BUYER" ? "Comprador" : "Proveedor"}
                </strong>
                <p>{p.user_id === userId ? "Tú" : p.user_id}</p>
              </div>
            </div>
          ))}
          {isBuyer && participants?.length === 1 && (
            <form action={updatePacto}>
              {fields("seller")}
              <label>
                ID del proveedor
                <input
                  name="sellerId"
                  placeholder="UUID del usuario Supabase"
                  required
                />
              </label>
              <p className="fine-print">
                Añade solo una identidad provisionada para este escenario DEMO.
                No equivale a verificación de proveedor.
              </p>
              <button className="button button-light">Añadir proveedor</button>
            </form>
          )}
          <div className="future-panel">
            <span className="eyebrow">PRÓXIMA FASE</span>
            <h3>Inteligencia con control humano</h3>
            <p>
              Agreement Intelligence, Evidence Intelligence y Scope Intelligence
              se integrarán después de Foundation.
            </p>
          </div>
        </section>
        <section className="card audit-card">
          <div className="card-heading">
            <h2>Actividad del Pacto</h2>
            <span className="badge badge-neutral">Servidor</span>
          </div>
          {events.map((e) => (
            <div className="audit-row" key={e.id}>
              <span className="audit-dot" />
              <div>
                <strong>{e.event_type}</strong>
                <p>
                  Actor {e.actor_id} · Objeto {e.object_id}
                </p>
              </div>
              <time dateTime={e.created_at}>
                {new Date(e.created_at).toLocaleString("es-MX", {
                  timeZone: "America/Mexico_City",
                })}
              </time>
            </div>
          ))}
          <details>
            <summary>Versiones del acuerdo</summary>
            {agreements.map((a) => (
              <p key={a.id}>
                v{a.version} · {a.state} · {a.scope}
              </p>
            ))}
          </details>
        </section>
      </div>
    </>
  );
}
