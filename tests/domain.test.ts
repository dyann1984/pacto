import { describe, it, expect } from "vitest";
import {
  assertTransition,
  assertMilestoneTotal,
  createPactoSchema,
} from "../src/domain/foundation";
describe("Agreement invariants", () => {
  it("rejects skipping review or reopening superseded agreements", () => {
    expect(() => assertTransition("DRAFT", "ACCEPTED")).toThrow();
    expect(() => assertTransition("SUPERSEDED", "DRAFT")).toThrow();
  });
  it("allows the defined lifecycle", () => {
    assertTransition("DRAFT", "REVIEW");
    assertTransition("REVIEW", "ACCEPTED");
    assertTransition("ACCEPTED", "SUPERSEDED");
  });
  it("requires positive integer amounts and matching totals", () => {
    assertMilestoneTotal(1740000, [
      { amount_cents: 500000 },
      { amount_cents: 700000 },
      { amount_cents: 540000 },
    ]);
    expect(() => assertMilestoneTotal(10, [{ amount_cents: 9 }])).toThrow();
    expect(() =>
      assertMilestoneTotal(10, [{ amount_cents: -5 }, { amount_cents: 15 }]),
    ).toThrow();
  });
  it("cannot create LIVE or a malformed agreement", () => {
    expect(
      createPactoSchema.safeParse({
        title: "Demo Pacto",
        scope: "Alcance definido",
        totalCents: 100,
        environment: "LIVE",
      }).success,
    ).toBe(false);
  });
});
