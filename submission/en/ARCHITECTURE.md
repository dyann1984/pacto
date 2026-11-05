# Technical architecture

## Guiding principle

**Authorization lives in the database, not in the interface.** Every rule is
enforced in PostgreSQL through Row Level Security and `SECURITY DEFINER`
functions. The interface only decides what to display; a tampered request is
rejected by the database just the same.

Practical consequence: the browser only receives the Supabase publishable key,
which is public by design. There is no custom API with permission logic that
could fall out of sync with the database.

## Layers

```
Browser  ──► Next.js (Server Components and Server Actions)  ──► Supabase Postgres
                   │                                               ▲
                   ├──► api.sandbox.paypal.com (Orders v2)         │
                   └──► api.anthropic.com (Messages)               │
                                                                   │
PayPal  ──► /api/paypal/webhook (verified signature) ──────────────┘
```

- **Server Actions** for all writes. There are no custom API routes that
  manipulate data, except the webhook, which is a required public endpoint.
- **`src/proxy.ts`** refreshes the session on protected routes.
- **Private keys** (PayPal, Anthropic, service role) are only read in
  `src/lib/`, never with the `NEXT_PUBLIC_` prefix. A repository script
  (`pnpm check:secrets`) fails the build if any leak into the client bundle.

## Data model

| Table | Contents |
|---|---|
| `profiles` | Each person's role (`user` / `admin`) |
| `pactos` | The agreement: title, state (`ACTIVE`/`CLOSED`/`CANCELLED`), reason |
| `participants` | Buyer and supplier; at most one of each per Pacto |
| `agreements` | Agreement versions: scope, amount, state |
| `milestones` | Deliverables: amount, state, evidence, dates |
| `acceptances` | Who accepted which version and when |
| `closure_confirmations` | Closure confirmations, one per party |
| `invitations` | Invitation links (only the SHA-256 of the token) |
| `payments` | PayPal Sandbox orders and captures |
| `ai_analyses` | AI analyses recorded as evidence |
| `audit_events` | Immutable history of everything above |

Invariants enforced by unique indexes, not by code:

- Only one draft or under-review version per Pacto.
- Only one accepted version per Pacto.
- Only one live payment per milestone (partial index on non-terminal states).
- Unique invitation token.

## State machine

```
Agreement:  DRAFT ──► REVIEW ──► ACCEPTED ──► SUPERSEDED
Milestone:  PENDING ──► EVIDENCE_SUBMITTED ──► APPROVED ──► PAID
Pacto:      ACTIVE ──► CLOSED | CANCELLED
```

Key transitions:

- `DRAFT → REVIEW` requires two participants and milestone amounts that add up
  to the agreement total.
- `REVIEW → ACCEPTED` requires two distinct acceptances.
- Editing an accepted agreement creates a new version, clears closure
  confirmations, and requires acceptance again.
- `EVIDENCE_SUBMITTED → APPROVED` can only be done by the buyer.
- `APPROVED → PAID` only happens after a real PayPal capture.

## Security

- **Isolation:** `is_participant()` governs all reads. Someone else's Pacto
  returns 404, leaking neither its existence nor its data.
- **Administration:** `/admin` requires a session and the admin role; otherwise
  it returns 404 instead of redirecting, so as not to reveal the route exists.
  `is_admin()` governs the extended read policies.
- **DEMO:** anonymous sessions are real Supabase users with their own
  `auth.uid()`. The exact same RLS isolates them. A single Pacto marked
  `is_demo_example` is readable by anyone, read-only and only because a
  migration marked it; no client can set that flag.
- **Invitations:** the link contains a random 64-character token; only its
  SHA-256 is stored in the database, and not even participants can read that
  column. It expires in 7 days, is single-use, and can be restricted to a
  specific email.
- **Secrets:** key values and external-provider response bodies are never
  logged; only short error codes.

## Design decisions and their reasons

- **Rules in the database, not the server.** Two clients (browser and server)
  diverge over time; an RLS policy does not.
- **PGlite in tests.** Running the real migrations against an in-memory
  PostgreSQL lets us test RLS for real on every change.
- **Guarded migrations.** Each one checks its prerequisite and aborts if
  already applied, inside a single transaction.
- **PayPal without its own session state.** The order is identified by
  `order_id`, unique in the database, which makes both the payer's return and
  the webhook idempotent.
