# Devpost submission texts

All text below is in English and ready to copy into the Devpost submission form.

---

## Title

PACTO

## Tagline

Agreements you can prove, payments you can authorize

## What it does

PACTO turns informal business agreements into a verifiable journey that both
parties see identically. The buyer states the scope, acceptance criteria, and
amount. Before anyone commits, AI reviews the agreement and flags ambiguities,
obligations, missing dates, risks, and inconsistencies — citing the exact words
that triggered each finding. Both parties explicitly accept the same version.
The supplier submits evidence of delivery, the buyer reviews and authorizes it,
and only then can the milestone be paid through PayPal Sandbox. Every action is
recorded with actor, timestamp, and version in a history that neither party can
alter.

## How we built it

PACTO is a Next.js 16 application using the App Router with Server Components
and Server Actions — there are no custom API routes except the PayPal webhook.
All business rules live in PostgreSQL as Row Level Security policies and
`SECURITY DEFINER` functions with empty `search_path`, so a tampered request is
rejected by the database itself, not by application code.

The payment flow uses PayPal Orders v2 (Sandbox) with idempotent order creation
(`paypal-request-id`), capture, status queries, and webhook signature
verification that fails closed. The AI analysis calls the Anthropic API
(`claude-sonnet-5-5`) with a structured prompt, validates the output against a
strict Zod schema, and stores the result with the model name and a SHA-256
fingerprint of the exact input.

Testing relies on PGlite (in-memory PostgreSQL) to run the real migrations and
test RLS policies for real, not against mocks. End-to-end tests run with
Playwright, including the complete Judge Mode journey.

## Challenges we ran into

1. **Two-party demo for a solo evaluator.** An agreement needs two people, which
   makes hackathon demos awkward. We solved this with Judge Mode: it provisions
   two genuinely separate Supabase identities in one browser and lets the
   evaluator switch sides with a button. It is not a simulation — each side is a
   real user with its own `auth.uid()`, and the same RLS policies apply.

2. **Supabase anonymous session rate limits.** Judge Mode uses two anonymous
   sessions per run, and Supabase defaults to 30 per hour per IP. During
   development, E2E suites exhausted this quickly. We documented the limit
   clearly (both entries explain it when it hits) and recommend raising it during
   the evaluation period.

3. **Webhook without a user session.** PayPal's webhook arrives without a logged-in
   user. Writing the capture result requires the `service_role` key, which
   bypasses RLS. We scoped this tightly: `record_payment_result` is the only RPC
   that accepts it, and the webhook verifies the signature before calling it.

4. **AI cost control for anonymous visitors.** Any DEMO visitor can trigger an
   analysis. We added per-version (3), per-person (6/day), and global caps
   enforced in the database, not in the UI.

## Accomplishments that we're proud of

- **The supplier cannot pay themselves.** The database enforces it. The button
  does not even render for the supplier, but even if it did, the server would
  reject it. Judges can verify this in seconds.
- **225 automated tests**, including RLS tests against real PostgreSQL
  (PGlite), 16 PayPal tests plus 12 for the webhook, 14 AI-analysis tests plus 5
  for its quota, and 38 end-to-end browser specs (35 passing, 3 skipped by design
  in the last full run).
- **Zero secrets exposed.** `check:secrets` scans the client bundle and all
  tracked files on every build.
- **Full end-to-end verification in production** on 12 October 2026: a real
  Anthropic analysis, a real PayPal Sandbox capture of 25,000 MXN with its
  signed webhook, and closure by both parties. Repeated on 5 November 2026: one
  Sandbox capture of 25,000 MXN (confirmed through the PayPal API and in the
  database) and closure by both parties.

## What we learned

- RLS policies are powerful but demand real-database testing. Mocking them
  defeats the purpose — PGlite running the actual migrations was the right
  investment.
- PayPal's webhook signature verification is thorough but unforgiving: the raw
  body must be byte-for-byte identical to what was signed. Re-serializing the
  JSON (parse + stringify) can change escapes or number formatting and break a
  legitimate verification.
- Structured AI output with strict schema validation is essential for trust.
  A model that returns a well-formed JSON analysis is useful; one that returns
  free text dressed up as an analysis is dangerous.

## What's next for PACTO

- **Multi-milestone agreements** with per-milestone payment schedules.
- **Internationalization (EN/ES)** using `next-intl`, keeping Spanish as
  default and adding English for international users.
- **Dispute resolution flow** when the buyer rejects evidence.
- **Production PayPal** with live credentials and real currency.
- **Custom SMTP** for public registration beyond Supabase's built-in email
  limit of 2 per hour.

## Built with

- Next.js 16
- TypeScript (strict mode)
- Supabase (PostgreSQL + Row Level Security + Auth)
- PayPal Orders v2 (Sandbox)
- Anthropic Claude API (claude-sonnet-5-5)
- Vercel
- Vitest
- PGlite
- Playwright
- Zod

## Try it out

- **Live demo:** https://pacto-pearl.vercel.app
- **Source code:** https://github.com/dyann1984/pacto
- **Video:** *(add YouTube URL after upload)*
