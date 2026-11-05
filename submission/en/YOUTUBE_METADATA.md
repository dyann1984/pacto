# YouTube upload — metadata and recording runbook

## Title (≤ 100 characters)

PACTO — AI-reviewed agreements, PayPal-authorized payments | PayPal AI Hackathon 2026

## Description

PACTO turns informal business agreements into a verifiable journey that buyer
and supplier see identically. AI reviews the agreement before anyone commits and
quotes the exact words behind each finding. Both sides accept the same version,
the supplier submits evidence, the buyer authorizes, and only then can the
milestone be paid through PayPal Sandbox. Nothing is paid, accepted or edited by
the AI.

Built for the PayPal AI Hackathon 2026.
The interface is in Spanish (built for the Latin American market); the narration
and captions are in English.

Live demo (Judge Mode: walk the whole deal alone): https://pacto-pearl.vercel.app/juez
Source code (MIT license): https://github.com/dyann1984/pacto

Chapters
0:00 The problem
0:15 Judge Mode: two real, isolated users
0:20 Create the agreement
0:30 AI review that quotes the exact words
0:58 Invite the supplier, both accept
1:15 Evidence, then the buyer authorizes
1:35 PayPal Sandbox payment
1:45 Closure and audit trail

PayPal Sandbox only: no real money moves.

## Tags

PACTO, PayPal AI Hackathon 2026, PayPal, PayPal Sandbox, Claude, Anthropic,
Next.js, Supabase, Row Level Security, AI agreements, fintech, escrow,
small business, Latin America, Devpost

## Settings

- Visibility: **Public** (not Unlisted, not Private)
- Audience: not made for kids; no age restriction
- Captions: upload `VIDEO_SUBTITLES.srt` as English
- Language: English

## Recording runbook (2:00)

1. Wait at least one hour after any test run: each Judge Mode start uses 2 of the
   30 anonymous sessions per hour per IP.
2. Run `pnpm check:integrations`; all three providers must answer OK.
3. Clean browser profile, 1920×1080, zoom 110%, no extensions visible.
4. Have the Sandbox buyer (Personal) account ready in a separate window. Never
   show its e-mail or password; blur the PayPal login fields when editing.
5. Follow `VIDEO_STORYBOARD.md` shot by shot (13 shots).
6. **Payment shot (1:35–1:45).** A new Judge Mode Pacto needs a new PayPal
   Sandbox approval (one capture of 25,000 MXN). The already completed Pacto
   from 5 November 2026 (paid, closed) can be used for the receipt close-up
   instead; it cannot be paid twice.
7. Pay before confirming closure: a closed Pacto no longer accepts payments.
