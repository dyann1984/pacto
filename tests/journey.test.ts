import { describe, it, expect } from "vitest";
import { currentStepIndex, nextStep, type JourneyInput } from "../src/domain/journey";
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

  it("asks for closure confirmation only after both accepted", () => {
    const accepted = { ...base, hasSeller: true, agreementState: "ACCEPTED" as const, acceptances: 2 };
    expect(nextStep(accepted).action).toBe("confirm");
    expect(nextStep({ ...accepted, iConfirmedClosure: true, closures: 1 }).waiting).toBe(true);
    expect(currentStepIndex(accepted)).toBe(4);
  });

  it("offers no action on closed, cancelled or example pactos", () => {
    expect(nextStep({ ...base, pactoStatus: "CLOSED" }).action).toBeNull();
    expect(currentStepIndex({ ...base, pactoStatus: "CLOSED" })).toBe(5);
    expect(nextStep({ ...base, pactoStatus: "CANCELLED" }).action).toBeNull();
    expect(nextStep({ ...base, myRole: null }).action).toBeNull();
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
