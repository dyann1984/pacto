import { notFound } from "next/navigation";
import { z } from "zod";
import { getPacto } from "@/application/pactos";
import { requireSession } from "@/lib/session";
import {
  cancelPacto,
  confirmClosure,
  runAgreementAnalysis,
  updatePacto,
} from "../actions";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const statusMessages: Record<string, { tone: "info" | "error"; text: string }> = {
  failed: {
    tone: "error",
    text: "No se pudo completar la acción. Revisa el estado del acuerdo e intenta de nuevo.",
  },
  PENDING_PROPOSAL: {
    tone: "error",
    text: "Hay una propuesta pendiente. Complétala antes de confirmar el cierre.",
  },
  PACTO_NOT_ACTIVE: {
    tone: "error",
    text: "Este Pacto ya no está activo y no admite cambios.",
  },
  INVALID_INPUT: {
    tone: "error",
    text: "El motivo debe tener entre 10 y 500 caracteres.",
  },
  INVALID_STATE: {
    tone: "error",
    text: "El cierre requiere un acuerdo aceptado por ambas partes.",
  },
  confirmed: {
    tone: "info",
    text: "Tu confirmación de cierre quedó registrada. Falta la confirmación de la otra parte.",
  },
  closed: { tone: "info", text: "Ambas partes confirmaron. El Pacto está cerrado." },
  cancelled: {
    tone: "info",
    text: "El Pacto fue cancelado. El motivo quedó registrado en la actividad.",
  },
};

const aiMessages: Record<string, { tone: "info" | "error"; text: string }> = {
  done: { tone: "info", text: "Análisis registrado. Revisa los hallazgos abajo." },
  failed: {
    tone: "error",
    text: "El análisis no se pudo completar. Intenta de nuevo más tarde.",
  },
  "not-configured": {
    tone: "error",
    text: "El análisis de IA no está configurado en el servidor (falta ANTHROPIC_API_KEY). No se muestran resultados simulados.",
  },
};

const eventLabels: Record<string, string> = {
  PACTO_CREATED: "Pacto creado",
  PARTICIPANT_ADDED: "Participante añadido",
  AGREEMENT_CREATED: "Acuerdo creado",
  AGREEMENT_SUBMITTED: "Enviado a revisión",
  AGREEMENT_ACCEPTED: "Aceptación registrada",
  AGREEMENT_UPDATED: "Versión editada",
  CLOSURE_CONFIRMED: "Confirmación de cierre",
  PACTO_CLOSED: "Pacto cerrado",
  PACTO_CANCELLED: "Pacto cancelado",
  AI_ANALYSIS_RECORDED: "Análisis de IA registrado",
};

const categoryLabels: Record<string, string> = {
  AMBIGUITY: "Ambigüedad",
  OBLIGATION: "Obligación",
  DATE: "Fecha o plazo",
  RISK: "Riesgo",
  INCONSISTENCY: "Inconsistencia",
};

const severityLabels: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

type Finding = {
  category: string;
  severity: string;
  quote: string;
  explanation: string;
  suggestion: string;
};

export default async function Center({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; ai?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getPacto(id);
  if (!detail) notFound();
  const { pacto, participants, agreements, events, userId } = detail;
  const current = agreements[0];
  const { status, ai } = await searchParams;
  const { db } = await requireSession();
  const [acceptanceResult, milestoneResult, closureResult, analysisResult] =
    await Promise.all([
      db
        .from("acceptances")
        .select("user_id,accepted_at")
        .eq("agreement_id", current.id),
      db.from("milestones").select("*").eq("agreement_id", current.id),
      db
        .from("closure_confirmations")
        .select("user_id,note,confirmed_at")
        .eq("pacto_id", id)
        .eq("agreement_id", current.id),
      db
        .from("ai_analyses")
        .select("id,model,input_sha256,result,created_at")
        .eq("agreement_id", current.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  if (acceptanceResult.error)
    throw new Error("No se pudieron consultar las aceptaciones.");
  if (milestoneResult.error)
    throw new Error("No se pudieron consultar los hitos.");
  if (closureResult.error)
    throw new Error("No se pudieron consultar las confirmaciones de cierre.");
  if (analysisResult.error)
    throw new Error("No se pudo consultar el análisis de IA.");
  const acceptances = acceptanceResult.data;
  const milestones = milestoneResult.data;
  const closures = closureResult.data ?? [];
  const latestAnalysis = analysisResult.data?.[0];
  const analysis = latestAnalysis
    ? (latestAnalysis.result as {
        summary: string;
        findings: Finding[];
        limitations: string;
      })
    : null;

  const isActive = pacto.status === "ACTIVE";
  const isBuyer = participants?.some(
    (p) => p.user_id === userId && p.role === "BUYER",
  );
  // Un Pacto de ejemplo público es visible para cualquiera, pero solo sus
  // participantes reales pueden actuar sobre él (el servidor ya lo exige;
  // esto evita además mostrar un botón que solo fallaría al usarse).
  const isParticipant = participants?.some((p) => p.user_id === userId) ?? false;
  const hasPendingProposal = agreements.some(
    (a) => a.state === "DRAFT" || a.state === "REVIEW",
  );
  const iConfirmedClosure = closures.some((c) => c.user_id === userId);
  const message = status ? statusMessages[status] ?? statusMessages.failed : null;
  const aiMessage = ai ? aiMessages[ai] ?? aiMessages.failed : null;

  function fields(operation: string) {
    return (
      <>
        <input type="hidden" name="pactoId" value={id} />
        <input type="hidden" name="agreementId" value={current.id} />
        <input type="hidden" name="operation" value={operation} />
      </>
    );
  }

  const statusLabel: Record<string, string> = {
    ACTIVE: "Activo",
    CLOSED: "Cerrado",
    CANCELLED: "Cancelado",
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMMAND CENTER · DEMO</span>
          <h1>{pacto.title}</h1>
          <p>Alcance, participantes, cierre y análisis del acuerdo.</p>
        </div>
        <div className="badge-group">
          <span className="badge">
            {current.state} · v{current.version}
          </span>
          <span className="badge badge-neutral">
            {statusLabel[pacto.status] ?? pacto.status}
          </span>
        </div>
      </div>
      {message && (
        <div
          className={message.tone === "error" ? "notice" : "notice notice-info"}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}
      {!isActive && (
        <div className="notice notice-info" role="status">
          Pacto {statusLabel[pacto.status]?.toLowerCase()}
          {pacto.status_reason ? `: ${pacto.status_reason}` : "."} Los acuerdos son de
          solo lectura.
        </div>
      )}
      <div className="journey">
        <span className="active">01 Acuerdo</span>
        <span className={closures.length ? "active" : undefined}>02 Cierre</span>
        <span className={analysis ? "active" : undefined}>03 Análisis IA</span>
        <span>04 Pagos · Fase posterior</span>
      </div>
      <div className="center-grid">
        <section className="card agreement-card">
          <div className="card-heading">
            <h2>Resumen del acuerdo</h2>
            <span className="badge">DEMO</span>
          </div>
          <div className="amount">
            {money.format(current.total_cents / 100)} <small>MXN</small>
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
              <span>{money.format(m.amount_cents / 100)}</span>
            </div>
          ))}
          <p className="fine-print">
            {acceptances?.length ?? 0}/2 aceptaciones de esta versión. Aceptar
            el acuerdo no ejecuta pagos.
          </p>
          {isActive && isParticipant && current.state === "DRAFT" && (
            <form action={updatePacto}>
              {fields("submit")}
              <button className="button" disabled={participants?.length !== 2}>
                Enviar a revisión →
              </button>
            </form>
          )}
          {isActive &&
            isParticipant &&
            current.state === "REVIEW" &&
            !acceptances?.some((a) => a.user_id === userId) && (
              <form action={updatePacto}>
                {fields("accept")}
                <button className="button">
                  Aceptar versión {current.version} →
                </button>
              </form>
            )}
          {isActive && isParticipant && (
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
                  Una edición requiere nuevas aceptaciones y reinicia las
                  confirmaciones de cierre. Las versiones aceptadas se conservan.
                </p>
                <button className="button">Guardar versión</button>
              </form>
            </details>
          )}
        </section>

        <section className="card">
          <h2>Cierre del Pacto</h2>
          {!isActive ? (
            <p>El cierre ya fue registrado. No hay acciones pendientes.</p>
          ) : current.state !== "ACCEPTED" ? (
            <p className="fine-print">
              El cierre requiere una versión aceptada por ambas partes.
              {hasPendingProposal ? " Hay una propuesta pendiente." : ""}
            </p>
          ) : (
            <>
              <p>
                {closures.length}/2 confirmaciones de cierre para la versión{" "}
                {current.version}. Confirmar significa que el alcance se cumplió
                según lo acordado; no libera pagos.
              </p>
              {closures.map((c) => (
                <p className="fine-print" key={c.user_id}>
                  {c.user_id === userId ? "Tú" : "Otra parte"} confirmó el{" "}
                  {new Date(c.confirmed_at).toLocaleString("es-MX", {
                    timeZone: "America/Mexico_City",
                  })}
                  {c.note ? `: “${c.note}”` : "."}
                </p>
              ))}
              {!isParticipant ? null : iConfirmedClosure ? (
                <p className="fine-print">
                  Esperando la confirmación de la otra parte.
                </p>
              ) : (
                <form action={confirmClosure}>
                  <input type="hidden" name="pactoId" value={id} />
                  <label>
                    Nota de cierre (opcional)
                    <textarea name="note" rows={2} maxLength={500} />
                  </label>
                  <button className="button">Confirmar cierre</button>
                </form>
              )}
            </>
          )}
          {isActive && isParticipant && (
            <details className="revision danger-zone">
              <summary>Cancelar Pacto</summary>
              <form action={cancelPacto}>
                <input type="hidden" name="pactoId" value={id} />
                <label>
                  Motivo de cancelación
                  <textarea
                    name="reason"
                    rows={3}
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </label>
                <p className="fine-print">
                  La cancelación es definitiva, queda registrada en la actividad
                  y bloquea cualquier cambio posterior.
                </p>
                <button className="button button-light">Cancelar Pacto</button>
              </form>
            </details>
          )}
        </section>

        <section className="card">
          <div className="card-heading">
            <h2>Análisis con IA</h2>
            <span className="badge badge-neutral">Asistencia</span>
          </div>
          {aiMessage && (
            <div
              className={aiMessage.tone === "error" ? "notice" : "notice notice-info"}
              role={aiMessage.tone === "error" ? "alert" : "status"}
            >
              {aiMessage.text}
            </div>
          )}
          <p className="fine-print">
            Detecta ambigüedades, obligaciones, fechas, riesgos e
            inconsistencias. No modifica el acuerdo ni toma decisiones
            contractuales.
          </p>
          {isParticipant && (
            <form action={runAgreementAnalysis}>
              {fields("analyze")}
              <button className="button">Analizar versión {current.version}</button>
            </form>
          )}
          {analysis && latestAnalysis ? (
            <div className="analysis">
              <p className="fine-print">
                Modelo {latestAnalysis.model} ·{" "}
                {new Date(latestAnalysis.created_at).toLocaleString("es-MX", {
                  timeZone: "America/Mexico_City",
                })}{" "}
                · Huella de entrada {latestAnalysis.input_sha256.slice(0, 12)}
              </p>
              <p>{analysis.summary}</p>
              {analysis.findings.length === 0 && (
                <p className="fine-print">No se detectaron hallazgos.</p>
              )}
              {analysis.findings.map((f, index) => (
                <article className="finding" key={index}>
                  <span className="badge badge-neutral">
                    {categoryLabels[f.category] ?? f.category} ·{" "}
                    {severityLabels[f.severity] ?? f.severity}
                  </span>
                  {f.quote && <blockquote>{f.quote}</blockquote>}
                  <p>{f.explanation}</p>
                  {f.suggestion && (
                    <p className="fine-print">Sugerencia: {f.suggestion}</p>
                  )}
                </article>
              ))}
              <p className="fine-print">Límites: {analysis.limitations}</p>
            </div>
          ) : (
            <p className="fine-print">Aún no hay análisis registrado para esta versión.</p>
          )}
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
          {isActive && isBuyer && participants?.length === 1 && (
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
                <strong>{eventLabels[e.event_type] ?? e.event_type}</strong>
                <p>
                  Actor {e.actor_id === userId ? "tú" : e.actor_id}
                  {e.detail ? ` · “${e.detail}”` : ""}
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
