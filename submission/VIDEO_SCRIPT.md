# Video script — final, 2:00

A single screen recording of **https://pacto-pearl.vercel.app** in **Judge Mode**, with
voice-over. Judge Mode provisions both parties in one window and switches between them
with a button, so the video also shows judges exactly how to evaluate PACTO.

> Hackathon rules: under three minutes, publicly visible on YouTube, showing the project
> actually working. Spoken track in English; the interface is Spanish (say so once).

Everything below was verified in production on 12 October 2026: a real Anthropic
analysis, a real PayPal Sandbox capture with its signed webhook, and closure by both
parties. Nothing in the video is staged.

---

## 0:00 – 0:15 · The problem

> **Screen:** landing page (`01-portada.png`), slow scroll to the six steps (`02-como-funciona.png`).

"Small businesses close deals in chat messages. The buyer pays up front and hopes, or
the supplier delivers and waits. When something goes wrong, nobody can prove what was
agreed. PACTO fixes that. The interface is in Spanish, built for the Latin American market."

## 0:15 – 0:30 · Judge Mode and the agreement

> **Screen:** `/juez` → «Comenzar el recorrido» → pre-filled form → «Crear acuerdo».

"Judge Mode creates two real, isolated users — buyer and supplier — so you can walk the
whole deal alone. The buyer writes the scope and the amount: twenty-five thousand pesos."

## 0:30 – 0:58 · AI risk review (Anthropic)

> **Screen:** «Analizar versión 1». Show the loading state, then the findings
> (`06-ia-hallazgos.png`). Point at a quoted fragment and at the attribution line.

"Before anyone commits, Claude reviews the agreement. While it works, the button says so
— each analysis is a paid call, so it can't be clicked twice.

Every finding quotes the exact words that caused it: no deadline, an undefined redesign,
the whole amount in a single milestone — with a concrete suggestion for each.

It is assistance, not a decision: the AI never edits the agreement, never accepts, never
pays. And it's capped per version, per person and per hour, so costs stay bounded."

## 0:58 – 1:15 · Both sides agree

> **Screen:** «Generar enlace de invitación» → «Abrir la invitación como proveedor» →
> join → send to review → accept → «Actuar como cliente» → accept.

"The supplier joins through a single-use, expiring link. Both accept the same version —
change a word later and both must accept again."

## 1:15 – 1:45 · Evidence, authorization, PayPal

> **Screen:** supplier submits evidence → switch to buyer → «Autorizar el pago de este
> hito» → `10-pagar-con-paypal.png` → PayPal Sandbox approval → back in PACTO: «Pagado»
> with the PayPal receipt ID.

"The supplier submits evidence. Notice: the supplier has no button to authorize their own
payment — the database would refuse it.

The buyer reviews and authorizes. Only then does PayPal appear. The buyer approves in
PayPal Sandbox, and PACTO records the capture — but only after verifying it with PayPal.
A browser can never mark a milestone as paid. PayPal's signed webhook confirms it, and a
refund issued in PayPal flows back the same way."

## 1:45 – 2:00 · Close and benefits

> **Screen:** both confirm closure; the six steps all green; scroll the activity trail.

"Both sides confirm, and every step is on an audit trail nobody can edit.

For the buyer: no paying blind. For the supplier: proof of delivery and a clear path to
getting paid. For both: one version of the truth.

PACTO. AI that advises, PayPal when a human says so."

---

## Recording notes

- Record at 1920×1080, browser zoom 110%. One window: Judge Mode needs nothing side by side.
- Before recording, run `pnpm check:integrations`: Supabase, PayPal Sandbox and Anthropic
  must all answer `OK` (verified on 12 October 2026).
- **Order matters:** pay *before* confirming closure. A closed Pacto no longer accepts
  payments, and the guided step says so ("Paga con PayPal y después confirma el cierre").
- The AI analysis takes about 20 seconds. Cut the wait in editing and keep the loading
  state on screen for a second — it's part of the story.
- The PayPal approval needs a **Sandbox buyer account** (developer.paypal.com → Testing
  Tools → Sandbox Accounts). Never show its email or password; blur the PayPal login.
- Limits a re-take can hit: 3 analyses per agreement version and 6 per person per day
  (start a fresh Judge Mode if needed), and Supabase allows 30 anonymous sessions per hour
  per IP — each Judge Mode run uses two.
- Do not show any real person's email or any key. The Judge Mode identities are anonymous.
- Still images for the Devpost gallery are in `submission/screenshots/` (see its README).
