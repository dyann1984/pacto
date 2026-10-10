# Video script — under 3 minutes

Target: 2:45. Screen recording of https://pacto-pearl.vercel.app with voice-over.
Record two browser windows side by side: a normal one (the buyer) and an incognito
one (the seller), so the two parties are visible at once.

---

## 0:00 – 0:25 · The problem

> **On screen:** the PACTO landing page.

"Most agreements between a small business and a supplier live in WhatsApp
messages. When something goes wrong, nobody can prove what was agreed, when it
changed, or who accepted what.

So the buyer pays up front and hopes — or the supplier delivers and waits.

PACTO turns that conversation into an agreement both sides can see, accept and
pay against."

## 0:25 – 0:50 · Create the agreement

> **On screen:** click "Explorar DEMO", then "Crear Pacto". Fill in a store
> redesign for 25,000 MXN. Submit.

"No sign-up. One click and you are in a real, isolated session.

The buyer writes what they expect: the scope, what is excluded, and the amount.

Notice the five steps across the top, and one clear next action. At every moment
each party knows exactly whose turn it is."

## 0:50 – 1:15 · Invite the supplier

> **On screen:** generate the invitation link, copy it, paste it into the
> incognito window. Show the preview, then join.

"To bring in the supplier, PACTO generates a secure link. Single use, expires in
seven days, and only a cryptographic hash of it is ever stored — so not even an
administrator could reconstruct it.

The supplier sees exactly what they are joining before they commit."

> **On screen:** reload the link in a third window — it is already used.

"And the link only works once."

## 1:15 – 1:40 · AI review

> **On screen:** the AI analysis panel.

"Before anyone commits, Claude reviews the scope and flags what is ambiguous,
what obligations are implied, what dates are missing, and where the terms
contradict themselves. Each finding quotes the exact wording that caused it.

The AI advises. It never edits the agreement, never accepts on anyone's behalf,
and never authorizes a payment. That is enforced in the database, not in the
interface."

## 1:40 – 2:05 · Both sides accept

> **On screen:** supplier accepts; buyer sees "1 of 2"; buyer accepts.

"Both parties accept the same version, explicitly. Change a single word later and
a new version is created that both have to accept again.

Nobody is ever bound to text they did not approve."

## 2:05 – 2:35 · Evidence, authorization, PayPal

> **On screen:** supplier submits evidence; buyer reads it and authorizes; the
> PayPal button; the PayPal approval screen; back to PACTO showing "Pagado".

"Now the money. The supplier submits evidence of what was delivered. The buyer
reads it and authorizes — explicitly, as a human being.

Only then does PayPal appear. The buyer approves the payment inside PayPal, and
PACTO records the capture against that specific milestone.

The supplier cannot authorize their own payment. The buyer cannot authorize
without evidence. Both rules live in Postgres, so a tampered form changes
nothing."

## 2:35 – 2:45 · Close

> **On screen:** both confirm closure; scroll the activity trail.

"Both sides confirm the work is done, and every action is there: who did what,
and when.

A clear agreement. Evidence before payment. PayPal when a human says so.

That is PACTO."

---

## Production notes

- Record at 1920×1080. Zoom the browser to 110% so text reads on a phone.
- Keep the two windows visible together during sections 3, 5 and 6.
- Do not show any email address or identifier belonging to a real person.
- **If PayPal credentials are not configured when you record**, replace 2:05–2:35
  with the evidence and authorization steps only, and say: "With PayPal Sandbox
  credentials configured, the buyer is taken to PayPal to approve the payment."
  Do not stage a fake payment screen.
- Same rule for the AI section: if the key is not configured, cut 1:15–1:40
  rather than showing an invented analysis.
