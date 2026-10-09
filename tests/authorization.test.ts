import { describe, it, expect } from "vitest";
import { requireParticipant, type Participant } from "../src/domain/foundation";
const participants: Participant[] = [
  { pacto_id: "A", user_id: "buyerA", role: "BUYER" },
  { pacto_id: "A", user_id: "sellerA", role: "SELLER" },
  { pacto_id: "B", user_id: "buyerB", role: "BUYER" },
  { pacto_id: "B", user_id: "buyerA", role: "SELLER" },
];
describe("application authorization and IDOR", () => {
  it("permits each member only their own Pacto", () => {
    expect(requireParticipant("sellerA", "A", participants).role).toBe(
      "SELLER",
    );
    expect(requireParticipant("buyerB", "B", participants).role).toBe("BUYER");
  });
  it("blocks changing ID to an unrelated Pacto", () => {
    expect(() => requireParticipant("sellerA", "B", participants)).toThrow(
      "NOT_FOUND",
    );
    expect(() => requireParticipant("buyerB", "A", participants)).toThrow(
      "NOT_FOUND",
    );
  });
  it("does not grant global buyer authority", () => {
    expect(requireParticipant("buyerA", "B", participants).role).toBe("SELLER");
    expect(() =>
      requireParticipant("buyerA", "B", participants, "BUYER"),
    ).toThrow();
  });
  it("denies an unknown identity", () =>
    expect(() => requireParticipant("unknown", "A", participants)).toThrow());
});
