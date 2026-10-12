import type { AgreementState, Role } from "./foundation";

// Recorrido de un Pacto contado al usuario: qué ya ocurrió, qué le toca a él y qué
// espera de la otra parte. Solo describe; las reglas reales las aplica la base (RPC).

export type PactoStatus = "ACTIVE" | "CLOSED" | "CANCELLED";

/**
 * Avance de las entregas del acuerdo aceptado. El cierre no puede ocurrir antes de que
 * cada hito tenga la evidencia del proveedor y la autorización del cliente: la base lo
 * exige (`DELIVERY_REQUIRED`) y esto solo sirve para contarlo antes de que falle.
 *
 * `total: 0` significa «sin información de entregas» (el acuerdo no está aceptado todavía,
 * o la migración de hitos no está aplicada): entonces no se condiciona nada.
 */
export interface DeliveryProgress {
  total: number;
  awaitingEvidence: number; // hitos sin evidencia del proveedor
  awaitingApproval: number; // con evidencia, pendientes de que el cliente autorice
  awaitingPayment?: number; // autorizados y todavía sin pagar
}

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
  deliveries?: DeliveryProgress;
  // Si se puede pagar con PayPal en este entorno. La base rechaza pagos en un Pacto
  // cerrado (`PACTO_NOT_ACTIVE`): si el cliente cierra antes de pagar, ya no podrá.
  paymentsEnabled?: boolean;
}

export type JourneyAction = "invite" | "submit" | "accept" | "deliver" | "confirm";

/** Si la entrega ya cumple los requisitos para poder confirmar el cierre. */
export function deliveryComplete(deliveries?: DeliveryProgress) {
  if (!deliveries || deliveries.total === 0) return true;
  return deliveries.awaitingEvidence === 0 && deliveries.awaitingApproval === 0;
}

export interface NextStep {
  title: string;
  body: string;
  action: JourneyAction | null;
  waiting: boolean;
  // Hay hitos autorizados sin pagar: conviene pagarlos antes de cerrar. Cerrar sigue
  // permitido —nunca dependió del pago—, pero se avisa de que después no se podrá.
  payFirst?: boolean;
}

export const journeySteps = [
  "Acuerdo creado",
  "Proveedor unido",
  "En revisión",
  "Aceptado por ambas partes",
  "Entrega autorizada",
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
  if (!deliveryComplete(input.deliveries)) return 4;
  return 5;
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

  // Antes de poder cerrar hay que cumplir la entrega. Ofrecer el cierre aquí era lo que
  // dejaba a la vista un Pacto «cerrado» con la entrega eternamente pendiente.
  if (!deliveryComplete(input.deliveries)) {
    const { awaitingEvidence } = input.deliveries!;
    if (awaitingEvidence > 0)
      return input.myRole === "SELLER"
        ? {
            title: "Registra lo que entregaste",
            body: "Describe la entrega en «Entregas y pagos». El cliente la revisará y, si está conforme, la autorizará. Hasta entonces el Pacto no se puede cerrar.",
            action: "deliver",
            waiting: false,
          }
        : waiting(
            "Esperando la entrega del proveedor",
            "El proveedor todavía no ha descrito qué entregó. Cuando lo haga, podrás revisarlo y autorizarlo en «Entregas y pagos».",
          );
    return input.myRole === "BUYER"
      ? {
          title: "Revisa la entrega y autorízala",
          body: "El proveedor ya describió lo entregado. Revísalo en «Entregas y pagos» y autorízalo si está conforme a lo acordado. Autorizar no ejecuta ningún pago.",
          action: "deliver",
          waiting: false,
        }
      : waiting(
          "Esperando que el cliente revise tu entrega",
          "Presentaste la evidencia. El cliente debe revisarla y autorizarla antes de que el Pacto pueda cerrarse.",
        );
  }

  const unpaid = input.deliveries?.awaitingPayment ?? 0;
  if (input.paymentsEnabled && unpaid > 0 && input.myRole === "BUYER" && !input.iConfirmedClosure)
    return {
      title: "Paga con PayPal y después confirma el cierre",
      body: "La entrega está autorizada. Paga el hito en «Entregas y pagos» antes de cerrar: un Pacto cerrado ya no admite pagos. Cuando PayPal confirme el cobro, confirma el cierre.",
      action: "confirm",
      waiting: false,
      payFirst: true,
    };

  return input.iConfirmedClosure
    ? waiting(
        "Esperando que la otra parte confirme el cierre",
        `Ya confirmaste el cierre (${input.closures} de 2). El Pacto se cierra cuando ambas partes confirman.`,
      )
    : {
        title: "Confirma el cierre",
        body: "La entrega ya está autorizada por el cliente. El Pacto se cierra cuando ambas partes confirman; cerrar no libera ningún pago.",
        action: "confirm",
        waiting: false,
      };
}
