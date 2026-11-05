# PACTO — Agreements you can prove, payments you can authorize

> English version of `submission/PROJECT_DESCRIPTION.md`. The Hackathon rules
> require all submission materials to be in English; the product interface is in
> Spanish by design, for the market it serves.

## The problem

Most agreements between a small business and its suppliers live in WhatsApp
threads, scattered emails and voice notes. When something goes wrong, nobody can
prove what was agreed, when it changed, or who accepted what.

That produces three concrete failures:

1. **Ambiguous scope.** "Redesign the store" means something different to each
   party, and neither finds out until delivery day.
2. **Unbacked payments.** Either the buyer pays up front on trust, or the
   supplier delivers and waits — and one of them absorbs the risk.
3. **No record.** When there is a disagreement, there is no impartial account of
   what actually happened.

For a small business, taking this to a lawyer costs more than the agreement
itself.

## The solution

PACTO turns an informal conversation into a five-step journey that both parties
see identically:

1. **Agreement created.** The buyer states the scope, the acceptance criteria and
   the amount.
2. **Supplier joined.** The supplier is invited with a single-use, expiring link —
   nobody has to look up a technical identifier.
3. **Under review.** AI reads the agreement and flags ambiguities, obligations,
   dates, risks and inconsistencies *before* either side commits.
4. **Accepted by both parties.** Both explicitly accept the same version. Any
   later change creates a new version that has to be accepted again.
5. **Delivery and payment.** The supplier submits evidence of delivery, the buyer
   reviews it and **explicitly authorizes** it, and only then can the milestone be
   paid through PayPal.

Every action is recorded with actor, timestamp and version in a history that
neither party can alter.

## What makes it different

**AI advises; people decide.** The AI analysis never edits the agreement, never
accepts on anyone's behalf and never authorizes a payment. That is not a promise
in the copy — the database enforces it. Paying requires the milestone to be in
`APPROVED` state; only the buyer can put it there, and only after the supplier has
submitted evidence. A supplier cannot approve their own invoice, and the UI does
not even render the button, because the server would reject it anyway.

**Security does not depend on the interface.** The rules live in PostgreSQL as
Row Level Security policies and `SECURITY DEFINER` functions. A tampered form
achieves nothing: the payment amount is read from the milestone row in the
database, never from the submitted form.

**Judges can run the whole cycle alone.** An agreement needs two parties, which
normally makes a hackathon demo awkward. **Judge Mode** (`/juez`) provisions two
genuinely separate Supabase identities in one browser and lets the evaluator
switch sides with a button. It is not a simulation: each side is a real user with
its own `auth.uid()`, and the same RLS policies apply to both. Switching roles is
equivalent to logging in as the other person — nothing is bypassed.

## How PayPal is used

PayPal Orders v2, in the **Sandbox** environment only, is the settlement step of
the journey — not a bolt-on button:

- The order is created server-side from the **milestone row**, with the amount and
  reference read from the database, and `paypal-request-id` for idempotency.
- The payer approves inside PayPal. PACTO never sees or stores card data.
- Capture is idempotent per order, and the capture ID is written back to the
  milestone as the receipt.
- Webhooks are verified against `/v1/notifications/verify-webhook-signature` and
  **fail closed**: without `PAYPAL_WEBHOOK_ID`, or on any verification error, the
  notification is discarded.
- The Sandbox host is hard-coded in `src/lib/paypal.ts`; the code cannot be
  configured into producing a real charge.

PACTO does not hold funds and is not an escrow: money moves from buyer to supplier
inside PayPal, and PACTO records what was delivered, who authorized it and what
the outcome was.

## How AI is used

The Anthropic API (`claude-sonnet-5-5`) reviews the agreement text at the moment
it matters — before either side accepts. It returns a strictly validated,
structured analysis: ambiguities, obligations, dates, risks and inconsistencies,
each citing the text it refers to.

Three design decisions keep it honest:

- The output is parsed against a strict schema; anything that does not match is
  rejected rather than shown.
- Every analysis is stored with the model name, the author and a SHA-256
  fingerprint of the exact input, so a result can always be tied to the version it
  judged.
- With no API key configured, the screen says so. There is no simulated output
  dressed up as a real analysis.

## Impact

- **For the buyer:** pay against reviewed evidence, not against promises.
- **For the supplier:** an explicit, dated authorization instead of "I'll pay you
  next week".
- **For both:** an impartial record if they disagree.

The model fits economies where business-to-business commerce runs on informal
messaging. The interface is in Spanish and amounts are in Mexican pesos.

## Technology

| Layer | Technology | Role |
|---|---|---|
| Interface | Next.js 16 (App Router, Server Actions) | Server-rendered; no custom API surface to protect |
| Language | TypeScript (strict) | |
| Data | Supabase Postgres + RLS | Business rules live in the database |
| Identity | Supabase Auth | Email with confirmation; anonymous sessions for the demo |
| Payments | PayPal Orders v2 (Sandbox) | Orders, capture, status and signed webhooks |
| AI | Anthropic API (`claude-sonnet-5-5`) | Agreement scope analysis |
| Deployment | Vercel | Production and per-branch Preview |
| Testing | Vitest + PGlite + Playwright | RLS against real Postgres; full browser journey |

PGlite runs the real migrations against an in-memory PostgreSQL, so the security
policies are tested for real rather than against test doubles.
