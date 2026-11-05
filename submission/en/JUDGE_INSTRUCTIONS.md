# Testing instructions for judges

> English version of `submission/DEMO_GUIDE.md`, required by the Hackathon rules.
> The product interface is in Spanish; every control you need is named below in
> both languages.

**Hosted demo:** https://pacto-pearl.vercel.app
**No registration, no installation, no credentials required.**

PACTO uses Supabase anonymous sessions for evaluation. You are a real,
isolated user of the database — not a mock — so nothing you do affects any other
evaluator, and nothing you see belongs to anyone else.

---

## Fastest path: Judge Mode — the whole cycle, alone, in about five minutes

An agreement needs two parties. So that you do not have to find a second person,
the landing page has a **"Modo Juez"** (Judge Mode) button.

PACTO provisions **two genuinely separate demo identities** — one buyer, one
supplier — in your single browser. A bar at the top tells you who you currently
are and lets you switch with one button.

This is not a simulation or a shortcut. Each identity is a real database user
with its own `auth.uid()`, and the server applies exactly the same Row Level
Security policies to both. Switching roles is equivalent to signing in as the
other person. You can verify this yourself: while acting as the supplier, the
"authorize payment" button does not exist — because the server would refuse it.

### The seven steps

| # | What you do | Button (Spanish) | What to look for |
|---|---|---|---|
| 1 | Open Judge Mode | `Modo Juez` → `Comenzar el recorrido →` | Two identities are created; you start as the buyer |
| 2 | Create the agreement | `Crear acuerdo →` | The form arrives pre-filled with a realistic scenario |
| 3 | Invite the supplier | `Generar enlace de invitación` | A single-use link that expires in 7 days |
| 4 | Join as the supplier | `Abrir la invitación como proveedor →`, then `Unirme como proveedor →` | The top bar now says you are the supplier |
| 5 | Review and accept, both sides | `Enviar a revisión →`, `Aceptar versión 1 →`, switch with `Actuar como cliente`, accept again | The agreement reaches `Aceptado`; acceptance is per-version |
| 6 | Evidence, then authorization | As supplier: fill the evidence box, `Presentar evidencia`. Switch to buyer: `Autorizar el pago de este hito` | The supplier **cannot** authorize their own milestone |
| 7 | Close | `Confirmar cierre` on both sides | The Pacto becomes `Cerrado`, with the full history below |

`Reiniciar demostración` ("restart the demo") creates a brand-new, isolated
scenario without deleting anything you did before.

> **If you see "Demasiadas sesiones de prueba en la última hora":** that is
> Supabase's anonymous sign-in rate limit, counted per hour and per IP address —
> not a failure. Judge Mode uses two of that budget, `Explorar DEMO` only one, so
> the plain demo often still works when Judge Mode is capped. Otherwise wait a few
> minutes, or sign in with an account. Both entry points tell you which of the two
> situations you are in.

---

## What to check if you want to test the security claims

These are the claims the project makes; each one can be falsified in the browser:

1. **A supplier cannot approve their own payment.** While acting as the supplier
   on an agreement with evidence submitted, the authorize button is absent. The
   server rejects the call too, not just the UI.
2. **A non-participant cannot read an agreement.** Copy a Pacto URL, switch to the
   other identity before it has joined, and open it: HTTP 404, with no leaked
   data.
3. **Two demo visitors are isolated.** Open `Explorar DEMO` in a second private
   window; that visitor cannot see anything from your scenario.
4. **The payment amount is not taken from the form.** It is read from the
   milestone row in the database. See `record_payment_order` in
   `supabase/migrations/202610120001_milestones_payments.sql`.
5. **Webhooks fail closed.** Without a verified PayPal signature the notification
   is discarded. See `verifyWebhook` in `src/lib/paypal.ts`.

---

## Running it yourself

Full setup instructions are in `submission/README.md` and the root `README.md`.
In short:

```bash
pnpm install
cp .env.example .env.local     # fill in the two Supabase values
# apply supabase/migrations/*.sql in filename order, as the database owner
pnpm build && pnpm start
```

The automated evidence:

```bash
pnpm test                               # 225 unit, authorization and RLS tests
pnpm build && pnpm exec playwright test # 38 end-to-end specs in a real browser
```

(Some end-to-end specs need optional demo credentials and three are skipped by
design — screenshots and real e-mail sign-up; see `docs/credentials-setup.md`.
Judge Mode creates anonymous sessions, so running the whole suite twice within an
hour can exhaust Supabase's 30-per-hour limit.)

The RLS tests run the real migrations against an in-memory PostgreSQL (PGlite),
so the security policies are exercised for real rather than against test doubles.
The end-to-end suite includes the complete Judge Mode journey — create, invite,
join, accept, evidence, authorize, close — plus the isolation checks above.

---

## Current status of the two integrations

PayPal and the AI analysis are implemented, unit-tested and wired into the
journey. Whether a judge sees them **live** depends only on environment variables
being present in the deployment — no code changes are involved.

| Integration | Code | Live in the hosted demo |
|---|---|---|
| PayPal Orders v2 (Sandbox) | `src/lib/paypal.ts`, 16 tests + 12 webhook tests | See the badge on the "Entregas y pagos" card |
| Anthropic agreement analysis | `src/lib/ai.ts`, 14 analysis tests + 5 quota tests | See the "Análisis con IA" card |

Where an integration is not configured, PACTO says so plainly on the screen
instead of showing a simulated result. That is deliberate: nothing in this
submission is staged.
