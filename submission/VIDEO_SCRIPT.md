# Video script — under 3 minutes

Target: 2:50. A single screen recording of https://pacto-pearl.vercel.app with
voice-over. **One browser window is enough:** the demo runs in Judge Mode, which
provisions both parties in the same window and lets you switch between them with
a button. That is also the feature judges will use, so the video doubles as the
instructions.

> The Hackathon rules require the video to be under three minutes, publicly
> visible on YouTube, and to show the project actually functioning.

---

## 0:00 – 0:25 · The problem

> **On screen:** the PACTO landing page.

"Most agreements between a small business and a supplier live in WhatsApp
messages. When something goes wrong, nobody can prove what was agreed, when it
changed, or who accepted what.

So the buyer pays up front and hopes — or the supplier delivers and waits.

PACTO turns that conversation into an agreement both sides can see, accept and
pay against."

## 0:25 – 0:45 · Judge Mode

> **On screen:** click "Modo Juez", then "Comenzar el recorrido". Land on the
> pre-filled form. Point at the bar at the top.

"An agreement needs two parties — which usually makes a demo awkward. So PACTO
provisions both.

These are two genuinely separate users in the database, each with its own
identity and its own row-level security. Switching sides here is the same as
logging in as the other person. Nothing is faked, and nothing is relaxed."

## 0:45 – 1:05 · Create the agreement

> **On screen:** submit the pre-filled store redesign for 25,000 MXN. The Pacto
> detail page opens.

"The buyer states the scope, what is excluded, and the amount.

Six stages across the top, and exactly one clear next action. At every moment
each party knows whose turn it is."

## 1:05 – 1:25 · Invite the supplier

> **On screen:** "Generar enlace de invitación". Show the link, then "Abrir la
> invitación como proveedor". Show the preview, then join.

"To bring in the supplier, PACTO generates a secure link: single use, expires in
seven days, and only a hash of it is ever stored — so not even an administrator
could reconstruct it.

The supplier sees exactly what they are joining before committing. Notice the bar
at the top: I am now the supplier."

## 1:25 – 1:50 · AI review

> **On screen:** the "Análisis con IA" panel, with findings that quote the scope.

"Before anyone commits, Claude reviews the scope and flags what is ambiguous,
what obligations are implied, what dates are missing, and where the terms
contradict themselves. Each finding quotes the exact wording that caused it, and
every analysis is stored with a fingerprint of the text it judged.

The AI advises. It never edits the agreement, never accepts on anyone's behalf,
and never authorizes a payment. That is enforced in the database, not in the
interface."

## 1:50 – 2:10 · Both sides accept

> **On screen:** submit for review, accept as supplier, switch with "Actuar como
> cliente", accept again. The badge turns to "Aceptado".

"Both parties accept the same version, explicitly. Change a single word later and
a new version is created that both have to accept again.

Nobody is ever bound to text they did not approve."

## 2:10 – 2:40 · Evidence, authorization, PayPal

> **On screen:** switch to supplier, fill the evidence box, submit. Point out
> that no authorize button exists here. Switch to buyer, read the evidence,
> "Autorizar el pago de este hito". Then the PayPal button, the PayPal Sandbox
> approval screen, and back to PACTO showing the milestone paid.

"Now the money. The supplier submits evidence of what was delivered — and look:
as the supplier, there is no button to authorize my own payment. It is not
hidden; the server would refuse it.

I switch to the buyer, read the evidence, and authorize. Explicitly, as a human.

Only then does PayPal appear. The buyer approves inside PayPal Sandbox, and PACTO
records the capture against that specific milestone. The amount comes from the
database row, never from the form. A payment only counts once PayPal confirms it:
the browser cannot mark anything as paid, and a refund issued in PayPal flows back
through a signed webhook."

> **Order matters:** pay *before* confirming closure. A closed Pacto no longer
> accepts payments, and the guided next step says so ("Paga con PayPal y después
> confirma el cierre").

## 2:40 – 2:55 · Close and benefits

> **On screen:** both confirm closure; scroll the activity trail.

"Both sides confirm the work is done, and every action is there: who did what,
and when.

For the buyer: no paying blind. For the supplier: proof of delivery and a clear
path to getting paid. For both: one version of the truth.

A clear agreement. Evidence before payment. PayPal when a human says so.

That is PACTO."

---

## Production notes

- Record at 1920×1080. Zoom the browser to 110% so text reads on a phone.
- Judge Mode runs in one window, so there is nothing to arrange side by side.
- Do not show any email address or identifier belonging to a real person.
- Before recording, run `pnpm check:integrations` and confirm PayPal and the AI
  key answer. As of 5 November 2026 both are configured and live in production
  (verified: the pay button appears after authorization, and a Sandbox capture
  completed). A "not activated" notice mid-take wastes a session.
- The canonical shot order and the 2:00 timing are in `submission/en/VIDEO_STORYBOARD.md`
  and `VIDEO_SUBTITLES.srt`; this script is the longer narration.
- **If the PayPal credentials are not configured when you record**, replace
  2:10–2:40 with the evidence and authorization steps only, and say: "With PayPal
  Sandbox credentials configured, the buyer is taken to PayPal to approve the
  payment." Do not stage a fake payment screen.
- Same rule for the AI section: if the key is not configured, cut 1:25–1:50
  rather than showing an invented analysis. Without both sections the video runs
  about 2:05, which leaves room to dwell on the security demonstration at 2:10.
- The spoken track is English, as the rules require; the interface is Spanish.
  Say so once, early, so it reads as a deliberate market choice.
