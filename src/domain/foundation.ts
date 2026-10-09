import { z } from "zod";
export const agreementStates = [
  "DRAFT",
  "REVIEW",
  "ACCEPTED",
  "SUPERSEDED",
] as const;
export type AgreementState = (typeof agreementStates)[number];
export type Role = "BUYER" | "SELLER";
export type Environment = "DEMO" | "LIVE";
export interface User {
  id: string;
  displayName: string;
}
export interface Pacto {
  id: string;
  title: string;
  environment: Environment;
  created_by: string;
  is_demo_example?: boolean;
}
export interface Participant {
  pacto_id: string;
  user_id: string;
  role: Role;
}
export interface Agreement {
  id: string;
  pacto_id: string;
  version: number;
  state: AgreementState;
  scope: string;
  total_cents: number;
  currency: "MXN";
}
export interface Milestone {
  id: string;
  agreement_id: string;
  title: string;
  amount_cents: number;
  sequence: number;
}
export interface AcceptanceCriterion {
  id: string;
  milestone_id: string;
  description: string;
}
export interface Acceptance {
  agreement_id: string;
  user_id: string;
  accepted_at: string;
}
export interface AuditEvent {
  id: string;
  pacto_id: string;
  actor_id: string;
  event_type: string;
  created_at: string;
}
export const createPactoSchema = z.object({
  title: z.string().trim().min(4).max(120),
  scope: z.string().trim().min(10).max(5000),
  totalCents: z.number().int().min(100).max(100_000_000),
  environment: z.literal("DEMO"),
});
export function assertTransition(from: AgreementState, to: AgreementState) {
  const allowed: Record<AgreementState, AgreementState[]> = {
    DRAFT: ["REVIEW"],
    REVIEW: ["DRAFT", "ACCEPTED"],
    ACCEPTED: ["SUPERSEDED"],
    SUPERSEDED: [],
  };
  if (!allowed[from].includes(to)) throw new Error("INVALID_TRANSITION");
}
export function requireParticipant(
  userId: string,
  pactoId: string,
  participants: Participant[],
  role?: Role,
) {
  const participant = participants.find(
    (p) => p.user_id === userId && p.pacto_id === pactoId,
  );
  if (!participant || (role && participant.role !== role))
    throw new Error("NOT_FOUND");
  return participant;
}
export function assertMilestoneTotal(
  total: number,
  milestones: Pick<Milestone, "amount_cents">[],
) {
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    milestones.some(
      (m) => !Number.isSafeInteger(m.amount_cents) || m.amount_cents <= 0,
    ) ||
    milestones.reduce((sum, m) => sum + m.amount_cents, 0) !== total
  )
    throw new Error("INVALID_TOTAL");
}
