import { describe, it, expect } from "vitest";
import {
  currentStepIndex,
  deliveryComplete,
  journeySteps,
  nextStep,
  type JourneyInput,
} from "../src/domain/journey";
import { safeNextPath } from "../src/lib/next-path";

const base: JourneyInput = {
  pactoStatus: "ACTIVE",
  agreementState: "DRAFT",
  version: 1,
  hasSeller: false,
  myRole: "BUYER",
  iAccepted: false,
  acceptances: 0,
  iConfirmedClosure: false,
  closures: 0,
};

describe("journey: one clear next step per party", () => {
  it("asks the buyer to invite a seller, and never mentions ids", () => {
    const step = nextStep(base);
    expect(step.action).toBe("invite");
    expect(step.body).not.toMatch(/uuid|id del/i);
    expect(currentStepIndex(base)).toBe(1);
  });

  it("asks either party to submit once the seller joined", () => {
    const input = { ...base, hasSeller: true };
    expect(nextStep(input).action).toBe("submit");
    expect(nextStep({ ...input, myRole: "SELLER" }).action).toBe("submit");
    expect(currentStepIndex(input)).toBe(2);
  });

  it("asks for acceptance, then tells who is being waited on", () => {
    const review = { ...base, hasSeller: true, agreementState: "REVIEW" as const };
    expect(nextStep(review).action).toBe("accept");
    const waiting = nextStep({ ...review, iAccepted: true, acceptances: 1 });
    expect(waiting.action).toBeNull();
    expect(waiting.waiting).toBe(true);
    expect(waiting.body).toContain("1 de 2");
  });

  const accepted = {
    ...base,
    hasSeller: true,
    agreementState: "ACCEPTED" as const,
    acceptances: 2,
  };

  it("asks for closure confirmation once accepted and the delivery is authorized", () => {
    // Sin información de entregas (acuerdo recién aceptado, o migración de hitos sin
    // aplicar) el recorrido no condiciona el cierre.
    expect(nextStep(accepted).action).toBe("confirm");
    expect(nextStep({ ...accepted, iConfirmedClosure: true, closures: 1 }).waiting).toBe(true);
    expect(currentStepIndex(accepted)).toBe(5);
  });

  it("never offers the closure before the seller registered the delivery", () => {
    const pending = {
      ...accepted,
      deliveries: { total: 1, awaitingEvidence: 1, awaitingApproval: 0 },
    };
    // El cliente espera; no se le ofrece cerrar algo que nadie ha entregado.
    expect(nextStep(pending).action).toBe(null);
    expect(nextStep(pending).waiting).toBe(true);
    expect(nextStep(pending).title).toMatch(/Esperando la entrega/);
    // Al proveedor se le pide la entrega, no el cierre.
    const seller = nextStep({ ...pending, myRole: "SELLER" as const });
    expect(seller.action).toBe("deliver");
    expect(seller.title).toMatch(/Registra lo que entregaste/);
    expect(currentStepIndex(pending)).toBe(4);
  });

  it("asks the buyer to authorize the delivery, and makes the seller wait", () => {
    const submitted = {
      ...accepted,
      deliveries: { total: 1, awaitingEvidence: 0, awaitingApproval: 1 },
    };
    const buyer = nextStep(submitted);
    expect(buyer.action).toBe("deliver");
    expect(buyer.title).toMatch(/Revisa la entrega/);
    const seller = nextStep({ ...submitted, myRole: "SELLER" as const });
    expect(seller.action).toBeNull();
    expect(seller.waiting).toBe(true);
    expect(currentStepIndex(submitted)).toBe(4);
  });

  it("offers the closure once every milestone is authorized or paid", () => {
    const ready = {
      ...accepted,
      deliveries: { total: 2, awaitingEvidence: 0, awaitingApproval: 0 },
    };
    expect(nextStep(ready).action).toBe("confirm");
    expect(currentStepIndex(ready)).toBe(5);
  });

  it("with PayPal active, tells the buyer to pay before closing, without blocking the closure", () => {
    // La base rechaza pagos en un Pacto cerrado: cerrar primero dejaba el pago imposible.
    const authorized = {
      ...accepted,
      deliveries: { total: 1, awaitingEvidence: 0, awaitingApproval: 0, awaitingPayment: 1 },
      paymentsEnabled: true,
    };
    const buyer = nextStep(authorized);
    expect(buyer.payFirst).toBe(true);
    expect(buyer.action).toBe("confirm");
    expect(buyer.body).toMatch(/ya no admite pagos/);
    // El proveedor no paga: a él se le sigue ofreciendo confirmar el cierre.
    expect(nextStep({ ...authorized, myRole: "SELLER" as const }).payFirst).toBeUndefined();
    // Sin PayPal activo no hay nada que pagar: no se le pide al cliente.
    expect(nextStep({ ...authorized, paymentsEnabled: false }).payFirst).toBeUndefined();
    // Pagado (ningún hito pendiente de pago): el cierre de siempre.
    const paid = { ...authorized, deliveries: { ...authorized.deliveries, awaitingPayment: 0 } };
    expect(nextStep(paid).payFirst).toBeUndefined();
    expect(nextStep(paid).title).toBe("Confirma el cierre");
  });

  it("deliveryComplete treats missing or empty delivery information as no gate", () => {
    expect(deliveryComplete(undefined)).toBe(true);
    expect(deliveryComplete({ total: 0, awaitingEvidence: 0, awaitingApproval: 0 })).toBe(true);
    expect(deliveryComplete({ total: 1, awaitingEvidence: 1, awaitingApproval: 0 })).toBe(false);
    expect(deliveryComplete({ total: 1, awaitingEvidence: 0, awaitingApproval: 1 })).toBe(false);
  });

  it("offers no action on closed, cancelled or example pactos", () => {
    expect(nextStep({ ...base, pactoStatus: "CLOSED" }).action).toBeNull();
    expect(currentStepIndex({ ...base, pactoStatus: "CLOSED" })).toBe(journeySteps.length);
    expect(nextStep({ ...base, pactoStatus: "CANCELLED" }).action).toBeNull();
    expect(nextStep({ ...base, myRole: null }).action).toBeNull();
  });

  it("the stepper shows the delivery stage, so no step is invisible to the user", () => {
    expect(journeySteps).toContain("Entrega autorizada");
    // Todo índice que devuelva currentStepIndex cabe en el stepper.
    for (const input of [base, { ...base, hasSeller: true }, accepted])
      expect(currentStepIndex(input)).toBeLessThanOrEqual(journeySteps.length);
  });

  it("a seller waits for the buyer when no seller slot is filled (defensive)", () => {
    expect(nextStep({ ...base, myRole: "SELLER" }).waiting).toBe(true);
  });
});

describe("safeNextPath: no open redirects after sign-in", () => {
  it("keeps internal paths", () => {
    expect(safeNextPath("/invitacion/abc123")).toBe("/invitacion/abc123");
    expect(safeNextPath("/pactos?status=joined")).toBe("/pactos?status=joined");
  });

  it("rejects external, protocol-relative and malformed targets", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)", "", null, 42, "/a b"])
      expect(safeNextPath(bad)).toBe("/pactos");
  });
});
