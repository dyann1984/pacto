import type { AgreementState, Role } from "./foundation";

// Recorrido de un Pacto contado al usuario: qué ya ocurrió, qué le toca a él y qué
// espera de la otra parte. Solo describe; las reglas reales las aplica la base (RPC).

export type PactoStatus = "ACTIVE" | "CLOSED" | "CANCELLED";

export interface JourneyInput {
  pactoStatus: PactoStatus;
  agreementState: AgreementState;
  version: number;
  hasSeller: boolean;
  myRole: Role | null; // null: visitante de un Pacto de ejemplo, sin participar
  iAccepted: boolean;
  acceptances: number;
  iConfirmedClosure: boolean;
  closures: number;
}

export type JourneyAction = "invite" | "submit" | "accept" | "confirm";

export interface NextStep {
  title: string;
  body: string;
  action: JourneyAction | null;
  waiting: boolean;
}

export const journeySteps = [
  "Acuerdo creado",
  "Proveedor unido",
  "En revisión",
  "Aceptado por ambas partes",
  "Cierre confirmado",
] as const;

export const agreementStateLabels: Record<AgreementState, string> = {
  DRAFT: "Borrador",
  REVIEW: "En revisión",
  ACCEPTED: "Aceptado",
  SUPERSEDED: "Reemplazado",
};

export const pactoStatusLabels: Record<PactoStatus, string> = {
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export const roleLabels: Record<Role, string> = {
  BUYER: "Comprador",
  SELLER: "Proveedor",
};

/** Índice del paso en curso dentro de journeySteps (los anteriores ya se cumplieron). */
export function currentStepIndex(input: JourneyInput) {
  if (input.pactoStatus === "CLOSED") return journeySteps.length;
  if (!input.hasSeller) return 1;
  if (input.agreementState === "DRAFT") return 2;
  if (input.agreementState === "REVIEW") return 3;
  return 4;
}

export function nextStep(input: JourneyInput): NextStep {
  const waiting = (title: string, body: string): NextStep => ({ title, body, action: null, waiting: true });

  if (input.pactoStatus === "CANCELLED")
    return { title: "Pacto cancelado", body: "El acuerdo quedó cancelado y ya no admite cambios. El motivo está en la actividad.", action: null, waiting: false };
  if (input.pactoStatus === "CLOSED")
    return { title: "Pacto cerrado", body: "Ambas partes confirmaron que la entrega se cumplió según lo acordado.", action: null, waiting: false };
  if (!input.myRole)
    return { title: "Pacto de ejemplo", body: "Puedes consultarlo, pero solo sus participantes pueden actuar sobre él. Crea tu propio Pacto para probar el recorrido completo.", action: null, waiting: false };

  if (!input.hasSeller)
    return input.myRole === "BUYER"
      ? {
          title: "Invita a tu proveedor",
          body: "Genera un enlace seguro y compártelo por correo o mensaje. Cuando tu proveedor lo abra y acepte, aparecerá aquí y podrán revisar el acuerdo juntos.",
          action: "invite",
          waiting: false,
        }
      : waiting("Esperando al proveedor", "El comprador todavía no ha invitado a un proveedor.");

  if (input.agreementState === "DRAFT")
    return {
      title: "Envía el acuerdo a revisión",
      body: "Comprueba que el alcance y el importe son correctos. Al enviarlo, ambas partes podrán aceptarlo. Si algo cambia, puedes editar el borrador antes.",
      action: "submit",
      waiting: false,
    };

  if (input.agreementState === "REVIEW")
    return input.iAccepted
      ? waiting(
          "Esperando la aceptación de la otra parte",
          `Ya aceptaste la versión ${input.version} (${input.acceptances} de 2). Cuando la otra parte también la acepte, podrán confirmar el cierre.`,
        )
      : {
          title: `Acepta la versión ${input.version}`,
          body: "Lee el alcance y el importe. Tu aceptación queda registrada y no ejecuta ningún pago. Si no estás de acuerdo, propón cambios editando el borrador.",
          action: "accept",
          waiting: false,
        };

  return input.iConfirmedClosure
    ? waiting(
        "Esperando que la otra parte confirme el cierre",
        `Ya confirmaste el cierre (${input.closures} de 2). El Pacto se cierra cuando ambas partes confirman.`,
      )
    : {
        title: "Confirma el cierre cuando se cumpla la entrega",
        body: "Confirma solo cuando el trabajo se haya entregado según lo acordado. El Pacto se cierra cuando ambas partes confirman; no libera pagos.",
        action: "confirm",
        waiting: false,
      };
}
