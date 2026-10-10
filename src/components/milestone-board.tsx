import { SubmitButton } from "@/components/submit-button";
import { approveMilestone, startPayment, submitEvidence } from "@/app/pactos/actions";
import type { Role } from "@/domain/foundation";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export type MilestoneRow = {
  milestone_id: string;
  title: string;
  amount_cents: number;
  sequence: number;
  status: "PENDING" | "EVIDENCE_SUBMITTED" | "APPROVED" | "PAID";
  evidence: string | null;
  payment_status: string | null;
  capture_id: string | null;
};

const statusLabels: Record<MilestoneRow["status"], string> = {
  PENDING: "Pendiente de entrega",
  EVIDENCE_SUBMITTED: "Evidencia presentada",
  APPROVED: "Autorizado para pago",
  PAID: "Pagado",
};

// Qué le toca hacer a cada parte en este hito. La base vuelve a exigirlo todo:
// aquí solo se decide qué se muestra.
function step(row: MilestoneRow, role: Role | null) {
  if (row.status === "PAID") return { text: "El pago quedó registrado con su comprobante.", action: null };
  if (row.status === "APPROVED")
    return role === "BUYER"
      ? { text: "Autorizaste este hito. Paga con PayPal cuando quieras.", action: "pay" as const }
      : { text: "El cliente autorizó el pago. Falta que lo realice.", action: null };
  if (row.status === "EVIDENCE_SUBMITTED")
    return role === "BUYER"
      ? { text: "Revisa la evidencia. Si todo está correcto, autoriza el pago.", action: "approve" as const }
      : { text: "Presentaste la evidencia. El cliente debe revisarla.", action: null };
  return role === "SELLER"
    ? { text: "Describe qué entregaste para que el cliente lo revise.", action: "evidence" as const }
    : { text: "Esperando que el proveedor presente la evidencia de entrega.", action: null };
}

export function MilestoneBoard({
  pactoId,
  rows,
  role,
  paypalReady,
}: {
  pactoId: string;
  rows: MilestoneRow[];
  role: Role | null;
  paypalReady: boolean;
}) {
  return (
    <section className="card">
      <div className="card-heading">
        <h2>Entregas y pagos</h2>
        <span className="badge badge-neutral">PayPal Sandbox</span>
      </div>
      <p className="fine-print">
        Los pagos se procesan en el entorno de pruebas de PayPal: no se mueve dinero
        real. PACTO no retiene fondos; registra qué se entregó, quién lo autorizó y
        cuál fue el resultado.
      </p>
      {rows.map((row) => {
        const next = step(row, role);
        return (
          <article className="milestone-card" key={row.milestone_id}>
            <div className="milestone-head">
              <div>
                <strong>{row.title}</strong>
                <p className="fine-print">{statusLabels[row.status]}</p>
              </div>
              <span className="milestone-amount">{money.format(row.amount_cents / 100)}</span>
            </div>
            {row.evidence && (
              <blockquote className="evidence">
                <span className="fine-print">Evidencia del proveedor</span>
                {row.evidence}
              </blockquote>
            )}
            {row.capture_id && (
              <p className="fine-print">Comprobante de PayPal: {row.capture_id}</p>
            )}
            <p>{next.text}</p>

            {next.action === "evidence" && (
              <form action={submitEvidence}>
                <input type="hidden" name="pactoId" value={pactoId} />
                <input type="hidden" name="milestoneId" value={row.milestone_id} />
                <label>
                  Qué entregaste
                  <textarea
                    name="evidence"
                    rows={3}
                    minLength={10}
                    maxLength={2000}
                    required
                    placeholder="Ej. Tienda publicada en el dominio acordado y revisada con el cliente el 12 de octubre."
                  />
                </label>
                <SubmitButton className="button button-light">Presentar evidencia</SubmitButton>
              </form>
            )}

            {next.action === "approve" && (
              <form action={approveMilestone}>
                <input type="hidden" name="pactoId" value={pactoId} />
                <input type="hidden" name="milestoneId" value={row.milestone_id} />
                <p className="fine-print">
                  Autorizar no ejecuta el pago: después eliges cuándo pagarlo en PayPal.
                </p>
                <SubmitButton>Autorizar el pago de este hito</SubmitButton>
              </form>
            )}

            {next.action === "pay" &&
              (paypalReady ? (
                <form action={startPayment}>
                  <input type="hidden" name="pactoId" value={pactoId} />
                  <input type="hidden" name="milestoneId" value={row.milestone_id} />
                  <SubmitButton pendingText="Conectando con PayPal…">
                    Pagar {money.format(row.amount_cents / 100)} con PayPal →
                  </SubmitButton>
                  <p className="fine-print">
                    Te llevamos a PayPal para que apruebes el pago. PACTO nunca ve los
                    datos de tu tarjeta ni de tu cuenta.
                  </p>
                </form>
              ) : (
                <div className="notice notice-info" role="status">
                  El pago con PayPal todavía no está activado en esta versión. El resto
                  del recorrido funciona con normalidad.
                </div>
              ))}
          </article>
        );
      })}
    </section>
  );
}
