# PACTO

**Agreements you can prove, payments you can authorize.**

PACTO turns an informal agreement between a small business and its supplier into
a five-step journey that both parties see identically: the scope is defined, AI
reviews it before anyone commits, both parties accept the same version, the
supplier submits evidence of delivery, the buyer explicitly authorizes it, and
only then can the milestone be paid through PayPal Sandbox. Every decision is
recorded in an audit trail that neither party can alter.

- **Live demo:** https://pacto-pearl.vercel.app
- **For evaluators:** [`submission/en/JUDGE_INSTRUCTIONS.md`](submission/en/JUDGE_INSTRUCTIONS.md)
- **Hackathon:** PayPal AI Hackathon 2026 — see [`submission/`](submission/)
- **License:** MIT ([`LICENSE`](LICENSE))

> The product interface is in Spanish, designed for the Latin American market.
> All submission materials are in English, in [`submission/en/`](submission/en/),
> as required by the hackathon rules. The Judge Instructions include a
> translation of every button.

## Try it without signing up

Click **"Modo Juez"** (Judge Mode) on the landing page. PACTO provisions two
real, independent DEMO identities in one browser — one buyer, one supplier — and
a top bar lets you switch sides with a button. It is not a simulation: each
identity is a real database user with its own `auth.uid()`, and the server
applies the same Row Level Security policies to both. Verify this yourself:
while acting as the supplier, the "authorize payment" button does not exist.

**"Explorar DEMO"** (Explore DEMO) enters as a single anonymous visitor.

## What's included

- **Authentication** with Supabase Auth and SSR sessions. Email sign-up with
  confirmation, password recovery, and sign-out. Anonymous sessions for the demo.
- **Roles** (`user` / `admin`). Every new registration gets `user` from a
  database trigger; `admin` is assigned only through a controlled migration.
- **Agreements** with buyer/seller participants and versioned scopes.
- **Invitations**: the buyer generates a single-use, expiring link (SHA-256
  stored, token never readable).
- **AI analysis** (`src/lib/ai.ts`): calls the Anthropic API, validates output
  against a strict Zod schema, and stores the result with model name, SHA-256
  input fingerprint, and author. Without a key, shows "not configured" — never
  simulated output.
- **Milestones, evidence, and payments**: the supplier submits evidence, the
  buyer reviews and authorizes, and only an `APPROVED` milestone can be paid.
  The amount is read from the database, never from the form.
- **PayPal Orders v2** (Sandbox only): idempotent orders, capture, status,
  and webhooks verified against PayPal's signature endpoint. Fails closed.
  The Sandbox host is hard-coded — cannot generate real charges.
- **Refunds**: webhook-driven, verified via `PAYMENT.CAPTURE.REFUNDED`.
- **Closure** with dual confirmation and unilateral **cancellation**.
- **Audit trail**: `audit_events` records every action with actor, timestamp,
  and detail.

The AI never modifies an agreement, never accepts on anyone's behalf, and never
authorizes a payment. This is not a promise in copy — the database enforces it.

## Requirements

- Node.js 22 or later
- pnpm 11.28.5 (`corepack pnpm@11.28.5` if not in PATH)
- A dedicated Supabase project

## Setup

```bash
cp .env.example .env.local
# Fill in .env.local on your machine. Never commit this file.
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Public key (`sb_publishable_…`), never `service_role` |
| `ANTHROPIC_API_KEY` | For AI | Server-only; no `NEXT_PUBLIC_` prefix |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5-5` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | For payments | **Sandbox** credentials |
| `PAYPAL_WEBHOOK_ID` | For webhooks | Without it, notifications are rejected (by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Only for local scripts and webhook reconciliation |

Without optional variables the app works the same: the interface explains that
the feature is not active instead of showing buttons that would fail.

How to obtain each credential: [`docs/credentials-setup.md`](docs/credentials-setup.md).

## Database

Apply **in order** from the Supabase SQL Editor, as the project owner:

1. `supabase/migrations/202610020001_foundation.sql`
2. `supabase/migrations/202610080001_closure_cancellation_ai.sql`
3. `supabase/migrations/202610090001_roles_admin.sql`
4. `supabase/migrations/202610090002_assign_owner_admin.sql`
5. `supabase/migrations/202610100001_demo_example.sql`
6. `supabase/migrations/202610110001_invitations.sql`
7. `supabase/migrations/202610120001_milestones_payments.sql`

Each migration is a single transaction that aborts if already applied. RLS is
active on all tables. Clients have no direct `INSERT`/`UPDATE`/`DELETE`: all
writes go through `SECURITY DEFINER` RPCs that use `auth.uid()`.

## Run

```bash
pnpm install --frozen-lockfile
pnpm dev      # http://127.0.0.1:3000
pnpm build
pnpm start
```

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test                 # 225 tests: domain, authorization, and RLS
pnpm check:secrets        # no secrets in the client bundle or the repo
pnpm check:integrations   # real calls to each provider
pnpm build
pnpm exec playwright test # 38 end-to-end specs in a real browser
```

The RLS tests run the real migrations against an in-memory PostgreSQL (PGlite),
so security policies are tested for real, not against mocks.

## Project structure

- `src/domain`: entities, invariants, journey, and AI analysis (prompt + output schema)
- `src/application`: authorized Pacto reads
- `src/lib`: Supabase SSR client, validated session, AI provider, PayPal client (server-only); Judge Mode session (browser-only)
- `src/app`: pages, Server Actions, read endpoint, and PayPal webhook
- `src/components`: Judge Mode bar, milestone board, invitation, and forms
- `supabase/migrations`: schema, RLS, transactional RPCs, and audit
- `tests/`: domain, authorization, IDOR, RLS on PostgreSQL, migrations, AI, PayPal, and E2E browser journeys
- `submission/en/`: English submission materials
