import { notFound } from "next/navigation";
import { z } from "zod";
import { getPacto } from "@/application/pactos";
import { requireSession } from "@/lib/session";
import { isAnalysisConfigured } from "@/lib/ai";
import { InviteSeller } from "@/components/invite-seller";
import { isPayPalConfigured } from "@/lib/paypal";
import { isSettlementConfigured } from "@/lib/supabase-service";
import { MilestoneBoard, type MilestoneRow } from "@/components/milestone-board";
import { JudgeRoleNote } from "@/components/judge-role-note";
import { SubmitButton } from "@/components/submit-button";
import {
  agreementStateLabels,
  currentStepIndex,
  journeySteps,
  nextStep,
  pactoStatusLabels,
  roleLabels,
  type PactoStatus,
} from "@/domain/journey";
import type { AgreementState, Role } from "@/domain/foundation";
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

const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });

const statusMessages: Record<string, { tone: "info" | "error"; text: string }> = {
  failed: {
    tone: "error",
    text: "No se pudo completar la acción. Recarga la página e intenta de nuevo.",
  },
  joined: {
    tone: "info",
    text: "Te uniste como proveedor. Revisa el alcance y el importe; el siguiente paso aparece abajo.",
  },
  PENDING_PROPOSAL: {
    tone: "error",
    text: "Hay cambios pendientes de aceptar. Ambas partes deben aceptar la nueva versión antes del cierre.",
  },
  PACTO_NOT_ACTIVE: {
    tone: "error",
    text: "Este Pacto ya no está activo y no admite cambios.",
  },
  INVALID_INPUT: {
    tone: "error",
    text: "El motivo debe tener entre 10 y 500 caracteres.",
  },
  INVALID_AMOUNT: {
    tone: "error",
    text: "Escribe un importe válido en pesos, por ejemplo 1500 o 1500.50.",
  },
  INVALID_STATE: {
    tone: "error",
    text: "El cierre requiere que ambas partes hayan aceptado el acuerdo.",
  },
  DELIVERY_REQUIRED: {
    tone: "error",
    text: "Todavía no se puede cerrar: falta que el proveedor registre la entrega y que el cliente la autorice en «Entregas y pagos».",
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
  limit: {
    tone: "info",
    text: "Esta versión ya tiene el máximo de 3 análisis. Si cambian el acuerdo, podrán analizar la nueva versión.",
  },
  saturado: {
    tone: "info",
    text: "El servicio de análisis está al límite en este momento. No es un fallo del acuerdo: espera un minuto y vuelve a intentarlo.",
  },
  config: {
    tone: "error",
    text: "El servicio de IA no está bien configurado (credencial o modelo). No es un problema de tu acuerdo y reintentar no lo resolverá: avisa a quien administra PACTO.",
  },
  proveedor: {
    tone: "error",
    text: "El proveedor de IA no respondió a tiempo. No se registró ningún análisis; puedes intentarlo de nuevo en unos minutos.",
  },
  salida: {
    tone: "error",
    text: "La IA respondió, pero sin un análisis completo y válido. No se muestra nada a medias; puedes intentarlo de nuevo.",
  },
  "not-configured": {
    tone: "info",
    text: "El análisis con IA todavía no está activado. Puedes continuar con el acuerdo con normalidad.",
  },
};

const paymentMessages: Record<string, { tone: "info" | "error"; text: string }> = {
  evidencia: { tone: "info", text: "Evidencia presentada. El cliente la revisará y decidirá si autoriza el pago." },
  aprobado: { tone: "info", text: "Hito autorizado. Ya puedes pagarlo con PayPal cuando quieras." },
  pagado: { tone: "info", text: "Pago registrado en PayPal Sandbox. El comprobante quedó en la actividad." },
  cancelado: { tone: "info", text: "Cancelaste el pago en PayPal. El hito sigue autorizado y puedes intentarlo de nuevo." },
  rechazado: { tone: "error", text: "PayPal no completó el pago. No se cobró nada; puedes intentarlo de nuevo." },
  pendiente: {
    tone: "info",
    text: "PayPal aceptó el pago y lo está procesando. Todavía no consta como cobrado: no vuelvas a pagar. El hito aparecerá como pagado cuando PayPal lo confirme.",
  },
  conciliacion: {
    tone: "error",
    text: "PayPal completó el cobro, pero PACTO no pudo registrarlo todavía. No vuelvas a pagar: el aviso firmado de PayPal lo conciliará y el hito aparecerá como pagado.",
  },
  CAPTURE_NOT_ALLOWED: {
    tone: "error",
    text: "Un cobro solo lo registra PACTO después de verificarlo en PayPal. No se puede marcar un hito como pagado desde el navegador.",
  },
  proveedor: { tone: "error", text: "No se pudo contactar con PayPal. Intenta de nuevo en unos minutos." },
  "no-configurado": { tone: "info", text: "El pago con PayPal todavía no está activado en esta versión." },
  EVIDENCE_REQUIRED: { tone: "error", text: "Falta la evidencia del proveedor antes de autorizar el pago." },
  APPROVAL_REQUIRED: { tone: "error", text: "Tienes que autorizar el hito antes de pagarlo." },
  AMOUNT_MISMATCH: { tone: "error", text: "El importe no coincide con el del hito. No se creó ningún pago." },
  PAYMENT_ALREADY_OPEN: { tone: "error", text: "Ya hay un pago en curso para este hito. Revísalo antes de crear otro." },
  INVALID_TRANSITION: { tone: "error", text: "Este hito ya no admite ese cambio." },
  INVALID_INPUT: { tone: "error", text: "La evidencia debe tener entre 10 y 2000 caracteres." },
  INVALID_STATE: { tone: "error", text: "Ambas partes deben aceptar el acuerdo antes de registrar entregas." },
  PACTO_NOT_ACTIVE: { tone: "error", text: "Este Pacto ya no está activo." },
  failed: { tone: "error", text: "No se pudo completar la operación de pago. Intenta de nuevo." },
};

const eventLabels: Record<string, string> = {
  EVIDENCE_SUBMITTED: "Evidencia de entrega presentada",
  MILESTONE_APPROVED: "Pago autorizado por el cliente",
  PAYMENT_ORDER_CREATED: "Orden de pago creada en PayPal",
  PAYMENT_CAPTURED: "Pago completado en PayPal",
  PAYMENT_FAILED: "Pago no completado",
  PAYMENT_REFUNDED: "Pago reembolsado por PayPal",
  PACTO_CREATED: "Pacto creado",
  PARTICIPANT_ADDED: "Se unió al Pacto",
  INVITATION_CREATED: "Invitación generada",
  AGREEMENT_CREATED: "Acuerdo creado",
  AGREEMENT_SUBMITTED: "Enviado a revisión",
  AGREEMENT_ACCEPTED: "Aceptó el acuerdo",
  AGREEMENT_UPDATED: "Editó el acuerdo",
  CLOSURE_CONFIRMED: "Confirmó el cierre",
  PACTO_CLOSED: "Pacto cerrado",
  PACTO_CANCELLED: "Pacto cancelado",
  AI_ANALYSIS_RECORDED: "Solicitó un análisis con IA",
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
  searchParams: Promise<{ status?: string; ai?: string; pago?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getPacto(id);
  if (!detail) notFound();
  const { pacto, participants, agreements, events, userId } = detail;
  const current = agreements[0];
  const { status, ai, pago } = await searchParams;
  const { db } = await requireSession();
  const [acceptanceResult, closureResult, analysisResult, directoryResult, boardResult, invitationResult] =
    await Promise.all([
      db
        .from("acceptances")
        .select("user_id,accepted_at")
        .eq("agreement_id", current.id),
      db
        .from("closure_confirmations")
        .select("user_id,note,confirmed_at")
        .eq("pacto_id", id)
        .eq("agreement_id", current.id),
      db
        .from("ai_analyses")
        .select("id,model,result,created_at")
        .eq("agreement_id", current.id)
        .order("created_at", { ascending: false })
        .limit(1),
      // Nombres legibles e invitaciones: si la migración de invitaciones aún no está
      // aplicada, la página sigue funcionando con etiquetas por rol.
      db.rpc("participant_directory", { p_id: id }),
      db.rpc("milestone_board", { p_id: id }),
      db
        .from("invitations")
        .select("created_at,expires_at")
        .eq("pacto_id", id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  if (acceptanceResult.error)
    throw new Error("No se pudieron consultar las aceptaciones.");
  if (closureResult.error)
    throw new Error("No se pudieron consultar las confirmaciones de cierre.");
  if (analysisResult.error)
    throw new Error("No se pudo consultar el análisis de IA.");
  const acceptances = acceptanceResult.data ?? [];
  const closures = closureResult.data ?? [];
  const latestAnalysis = analysisResult.data?.[0];
  const analysis = latestAnalysis
    ? (latestAnalysis.result as {
        summary: string;
        findings: Finding[];
        limitations: string;
      })
    : null;
  const directory = new Map(
    ((directoryResult.data ?? []) as { user_id: string; label: string }[]).map((d) => [
      d.user_id,
      d.label,
    ]),
  );
  const openInvitation = invitationResult.error ? null : invitationResult.data?.[0];
  const invitationsAvailable = !directoryResult.error;
  // Si la migración de hitos y pagos aún no está aplicada, la página sigue
  // funcionando sin la sección de entregas.
  const milestones = (boardResult.error ? [] : (boardResult.data ?? [])) as MilestoneRow[];

  const pactoStatus = pacto.status as PactoStatus;
  const isActive = pactoStatus === "ACTIVE";
  // «Listo» incluye poder registrar el resultado: ofrecer pagar sin conciliación dejaría
  // un cobro real en PayPal sin constancia en PACTO.
  const paypalReady = isPayPalConfigured() && isSettlementConfigured();
  const myRole = (participants?.find((p) => p.user_id === userId)?.role ?? null) as Role | null;
  const isParticipant = myRole !== null;
  const roleOf = (uid: string) =>
    participants?.find((p) => p.user_id === uid)?.role as Role | undefined;
  const who = (uid: string) => {
    if (uid === userId) return "Tú";
    const role = roleOf(uid);
    const label = directory.get(uid);
    if (role && label) return `${label} (${roleLabels[role].toLowerCase()})`;
    return role ? roleLabels[role] : "Otra parte";
  };

  const state = current.state as AgreementState;
  const journey = {
    pactoStatus,
    agreementState: state,
    version: current.version,
    hasSeller: participants?.some((p) => p.role === "SELLER") ?? false,
    myRole,
    iAccepted: acceptances.some((a) => a.user_id === userId),
    acceptances: acceptances.length,
    iConfirmedClosure: closures.some((c) => c.user_id === userId),
    closures: closures.length,
    // Solo el acuerdo aceptado trae hitos (milestone_board los filtra): mientras no lo
    // esté, `total: 0` deja el recorrido sin condicionar.
    deliveries: {
      total: milestones.length,
      awaitingEvidence: milestones.filter((m) => m.status === "PENDING").length,
      awaitingApproval: milestones.filter((m) => m.status === "EVIDENCE_SUBMITTED").length,
      awaitingPayment: milestones.filter((m) => m.status === "APPROVED").length,
    },
    paymentsEnabled: paypalReady,
  };
  const step = nextStep(journey);
  const stepIndex = currentStepIndex(journey);
  const message = status ? statusMessages[status] ?? statusMessages.failed : null;
  const aiMessage = ai ? aiMessages[ai] ?? aiMessages.failed : null;
  const paymentMessage = pago ? paymentMessages[pago] ?? paymentMessages.failed : null;
  const aiReady = isAnalysisConfigured();

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
          <span className="eyebrow">ACUERDO</span>
          <h1>{pacto.title}</h1>
          <p>Comprador y proveedor revisan, aceptan y cierran la misma versión.</p>
        </div>
        <div className="badge-group">
          <span className="badge">
            {agreementStateLabels[state] ?? state} · versión {current.version}
          </span>
          <span className="badge badge-neutral">
            {pactoStatusLabels[pactoStatus] ?? pactoStatus}
          </span>
        </div>
      </div>
      {[message, paymentMessage].map(
        (m, index) =>
          m && (
            <div
              key={index}
              className={m.tone === "error" ? "notice" : "notice notice-info"}
              role={m.tone === "error" ? "alert" : "status"}
            >
              {m.text}
            </div>
          ),
      )}

      <ol className="stepper" aria-label="Avance del Pacto">
        {journeySteps.map((label, index) => (
          <li
            key={label}
            className={
              pactoStatus === "CANCELLED"
                ? undefined
                : index < stepIndex
                  ? "done"
                  : index === stepIndex
                    ? "current"
                    : undefined
            }
            aria-current={index === stepIndex ? "step" : undefined}
          >
            <span>{index < stepIndex ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section
        className={step.waiting ? "card next-step next-step-waiting" : "card next-step"}
        aria-labelledby="next-step-title"
      >
        <span className="eyebrow">{step.waiting ? "EN ESPERA" : "QUÉ SIGUE"}</span>
        <h2 id="next-step-title">{step.title}</h2>
        <p>{step.body}</p>
        {/* En Modo Juez, si el paso le toca a la otra parte, se indica el cambio. */}
        {isActive && step.waiting && myRole && (
          <JudgeRoleNote role={myRole === "BUYER" ? "SELLER" : "BUYER"} />
        )}
        {isActive && step.action === "invite" &&
          (invitationsAvailable ? (
            <>
              {openInvitation && (
                <p className="fine-print">
                  Ya generaste un enlace el {dateTime(openInvitation.created_at)}, vigente
                  hasta el {dateTime(openInvitation.expires_at)}. Si lo perdiste, genera
                  uno nuevo: el anterior dejará de funcionar.
                </p>
              )}
              <InviteSeller pactoId={id} title={pacto.title} />
            </>
          ) : (
            <div className="notice" role="status">
              Las invitaciones se están habilitando. Vuelve a intentarlo en unos minutos.
            </div>
          ))}
        {isActive && step.action === "deliver" && (
          <a className="button" href="#entregas">
            Ir a Entregas y pagos ↓
          </a>
        )}
        {isActive && step.action === "submit" && (
          <form action={updatePacto}>
            {fields("submit")}
            <SubmitButton>Enviar a revisión →</SubmitButton>
          </form>
        )}
        {isActive && step.action === "accept" && (
          <form action={updatePacto}>
            {fields("accept")}
            <SubmitButton>Aceptar versión {current.version} →</SubmitButton>
          </form>
        )}
        {isActive && step.payFirst && (
          <a className="button" href="#entregas">
            Ir a pagar con PayPal ↓
          </a>
        )}
        {isActive && step.action === "confirm" && (
          <form action={confirmClosure}>
            <input type="hidden" name="pactoId" value={id} />
            <label>
              Nota de cierre (opcional)
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                placeholder="Ej. Entrega revisada en sitio el 10 de octubre."
              />
            </label>
            <SubmitButton>Confirmar cierre</SubmitButton>
          </form>
        )}
      </section>

      <div className="center-grid">
        <section className="card agreement-card">
          <div className="card-heading">
            <h2>Lo que se acordó</h2>
            <span className="badge badge-neutral">Versión {current.version}</span>
          </div>
          <div className="amount">
            {money.format(current.total_cents / 100)} <small>MXN</small>
          </div>
          <p className="scope">{current.scope}</p>
          <p className="fine-print">
            {state === "ACCEPTED"
              ? "Ambas partes aceptaron esta versión."
              : state === "REVIEW"
                ? `${acceptances.length} de 2 partes aceptaron esta versión.`
                : "Borrador: todavía no se ha enviado a revisión."}{" "}
            Aceptar el acuerdo no ejecuta pagos.
          </p>
          {isActive && isParticipant && (
            <details className="revision">
              <summary>
                {state === "ACCEPTED" ? "Proponer cambios (nueva versión)" : "Editar el acuerdo"}
              </summary>
              <form action={updatePacto}>
                {fields("revise")}
                <label>
                  Alcance y criterios de aceptación
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
                  Importe acordado · MXN
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    max="1000000"
                    step="0.01"
                    defaultValue={(current.total_cents / 100).toFixed(2)}
                    required
                  />
                </label>
                <p className="fine-print">
                  Al guardar, ambas partes deberán aceptar de nuevo y se reinician las
                  confirmaciones de cierre. Las versiones aceptadas anteriores se conservan.
                </p>
                <SubmitButton className="button button-light">Guardar cambios</SubmitButton>
              </form>
            </details>
          )}
        </section>

        <section className="card">
          <h2>Participantes</h2>
          {(["BUYER", "SELLER"] as const).map((role) => {
            const p = participants?.find((x) => x.role === role);
            return (
              <div className="participant" key={role}>
                <span className="avatar">{role === "BUYER" ? "C" : "P"}</span>
                <div>
                  <strong>{roleLabels[role]}</strong>
                  <p>
                    {p
                      ? p.user_id === userId
                        ? "Tú"
                        : directory.get(p.user_id) ?? "Se unió al Pacto"
                      : "Pendiente de invitación"}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        {milestones.length > 0 && state === "ACCEPTED" && (
          <MilestoneBoard
            pactoId={id}
            rows={milestones}
            role={myRole}
            paypalReady={paypalReady}
            active={isActive}
          />
        )}

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
            Señala ambigüedades, obligaciones, fechas, riesgos e inconsistencias del
            alcance. No modifica el acuerdo ni decide por ninguna de las partes.
          </p>
          {isParticipant &&
            (aiReady ? (
              <form action={runAgreementAnalysis}>
                {fields("analyze")}
                {/* Un análisis tarda de segundos a un minuto: sin estado de carga la persona
                    vuelve a pulsar, y cada llamada al proveedor se paga. */}
                <SubmitButton
                  className="button button-light"
                  pendingText="Analizando el acuerdo… puede tardar hasta un minuto"
                >
                  Analizar versión {current.version}
                </SubmitButton>
              </form>
            ) : (
              <p className="notice notice-info" role="status">
                El análisis con IA todavía no está activado en esta versión. El resto del
                recorrido funciona con normalidad.
              </p>
            ))}
          {analysis && latestAnalysis ? (
            <div className="analysis">
              <p className="fine-print">
                Analizado el {dateTime(latestAnalysis.created_at)} por {latestAnalysis.model}{" "}
                (Anthropic), sobre la versión {current.version} del acuerdo.
              </p>
              <p>{analysis.summary}</p>
              {analysis.findings.length === 0 && (
                <p className="fine-print">No se detectaron hallazgos.</p>
              )}
              {analysis.findings.map((f, index) => (
                <article className="finding" key={index}>
                  <span className="badge badge-neutral">
                    {categoryLabels[f.category] ?? f.category} · prioridad{" "}
                    {(severityLabels[f.severity] ?? f.severity).toLowerCase()}
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
            aiReady && (
              <p className="fine-print">Aún no hay análisis para esta versión.</p>
            )
          )}
        </section>

        <section className="card audit-card">
          <div className="card-heading">
            <h2>Actividad</h2>
            <span className="badge badge-neutral">Registro inalterable</span>
          </div>
          {events.map((e) => (
            <div className="audit-row" key={e.id}>
              <span className="audit-dot" />
              <div>
                <strong>{eventLabels[e.event_type] ?? "Actividad registrada"}</strong>
                <p>
                  {who(e.actor_id)}
                  {e.detail && e.event_type !== "AI_ANALYSIS_RECORDED" ? ` · “${e.detail}”` : ""}
                </p>
              </div>
              <time dateTime={e.created_at}>{dateTime(e.created_at)}</time>
            </div>
          ))}
          {agreements.length > 1 && (
            <details>
              <summary>Versiones anteriores</summary>
              {agreements.slice(1).map((a) => (
                <p key={a.id}>
                  Versión {a.version} ·{" "}
                  {agreementStateLabels[a.state as AgreementState] ?? a.state} ·{" "}
                  {money.format(a.total_cents / 100)} · {a.scope}
                </p>
              ))}
            </details>
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
                  La cancelación es definitiva, queda registrada en la actividad y
                  bloquea cualquier cambio posterior.
                </p>
                <SubmitButton className="button button-light">Cancelar Pacto</SubmitButton>
              </form>
            </details>
          )}
        </section>
      </div>
    </>
  );
}
