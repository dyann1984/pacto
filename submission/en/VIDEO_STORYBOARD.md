# Video storyboard — PACTO, under 3 minutes

Based on `VIDEO_SCRIPT.md`. Each row is a shot with its timing, screen content,
voice-over, and the SRT subtitle cue that covers it. The recording is a single
screen capture of https://pacto-pearl.vercel.app in Judge Mode.

## Pre-recording checklist

- [ ] Browser: clean profile, no extensions visible, 1920×1080, zoom 110%
- [ ] Run `pnpm check:integrations` — Supabase, PayPal Sandbox, and Anthropic
      must all answer OK
- [ ] PayPal Sandbox buyer account ready (developer.paypal.com → Testing Tools
      → Sandbox Accounts). Never show its email or password on screen
- [ ] Judge Mode uses 2 anonymous sessions per run. Budget: 30/hour/IP
- [ ] AI analysis limit: 3 per agreement version, 6 per person per day

## Shot list

| # | Time | Screen | Voice-over (EN) | UI buttons (ES → EN) |
|---|---|---|---|---|
| 1 | 0:00–0:15 | Landing page, slow scroll to the six steps | "Small businesses close deals in chat messages…" | — |
| 2 | 0:15–0:20 | Click "Modo Juez" → "Comenzar el recorrido →" | "Judge Mode creates two real, isolated users…" | Modo Juez → Judge Mode · Comenzar el recorrido → Start the journey |
| 3 | 0:20–0:30 | Pre-filled form → "Crear acuerdo →" | "The buyer writes the scope and the amount: twenty-five thousand pesos." | Crear acuerdo → Create agreement |
| 4 | 0:30–0:43 | "Analizar versión 1". Show loading state, then findings | "Before anyone commits, Claude reviews the agreement. While it works, the button says so…" | Analizar versión 1 → Analyze version 1 |
| 5 | 0:43–0:58 | Point at a quoted fragment and attribution line | "Every finding quotes the exact words… It is assistance, not a decision." | — |
| 6 | 0:58–1:05 | "Generar enlace de invitación" → invitation link | "The supplier joins through a single-use, expiring link." | Generar enlace → Generate link |
| 7 | 1:05–1:10 | "Abrir la invitación como proveedor →" → join | — | Unirme como proveedor → Join as supplier |
| 8 | 1:10–1:15 | Send to review → accept → switch to buyer → accept | "Both accept the same version — change a word later and both must accept again." | Enviar a revisión → Send for review · Aceptar → Accept · Actuar como cliente → Act as buyer |
| 9 | 1:15–1:25 | Supplier submits evidence. Show missing authorize button | "The supplier submits evidence. Notice: the supplier has no button to authorize their own payment." | Presentar evidencia → Submit evidence |
| 10 | 1:25–1:35 | Switch to buyer → "Autorizar el pago de este hito" → PayPal | "The buyer reviews and authorizes. Only then does PayPal appear." | Autorizar el pago → Authorize payment |
| 11 | 1:35–1:45 | PayPal Sandbox approval → back in PACTO: "Pagado" with receipt | "The buyer approves in PayPal Sandbox, and PACTO records the capture." | — (PayPal UI) |
| 12 | 1:45–1:55 | Both confirm closure. Six steps all green. Scroll audit trail | "Both sides confirm, and every step is on an audit trail nobody can edit." | Confirmar cierre → Confirm closure |
| 13 | 1:55–2:00 | Final shot: completed Pacto | "For both: one version of the truth. PACTO. AI that advises, PayPal when a human says so." | — |

## Editing notes

- The AI analysis takes ~20 seconds. Cut the wait and keep the loading state
  visible for ~1 second — it's part of the story.
- The PayPal Sandbox approval screen: **blur the login fields**. Never show the
  Sandbox account's email or password.
- Total target: **2:00** (well under the 3-minute limit).
- No background music required. Clean narration is stronger for a technical demo.

## Post-production

1. Export at 1920×1080, H.264, ≤ 50 Mbps
2. Upload to YouTube as **Public** (not Private, not Unlisted)
3. Title: "PACTO — AI-reviewed agreements, PayPal-authorized payments | PayPal AI Hackathon 2026"
4. Description: include demo link, repo link, one-line summary
5. Upload `VIDEO_SUBTITLES.srt` as English closed captions (YouTube Studio →
   Subtitles → Add language → English → Upload file)
6. Verify the video is accessible without login and without age restriction
7. Copy the URL to the Devpost submission form

## Recording sequence (in case of re-take)

If you need to re-record after hitting a limit:

- Start a fresh Judge Mode session ("Reiniciar demostración")
- Each run uses 2 anonymous sessions (out of 30/hour/IP budget)
- AI analysis: 3 per version, 6 per person per day — start fresh if capped
- PayPal Sandbox: the buyer account has unlimited test balance
