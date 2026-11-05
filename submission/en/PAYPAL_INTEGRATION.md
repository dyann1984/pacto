# PayPal integration

## Scope and limits

- **Sandbox only.** `src/lib/paypal.ts` hard-codes the Sandbox host
  unconditionally: even if someone configures a production base, it is ignored.
  There is no code path that can generate a real charge.
- **PACTO is not an escrow.** It does not hold funds or act as a regulated
  intermediary. Payment flows from buyer to supplier inside PayPal; PACTO
  records what was delivered, who authorized it, and what the outcome was.
- **PACTO never sees payment data.** The payer enters their details in PayPal.
  Only order and capture identifiers are stored in the database.

## Payment journey

```
1. Supplier submits evidence       submit_milestone_evidence()   PENDING → EVIDENCE_SUBMITTED
2. Buyer reviews and AUTHORIZES    approve_milestone()           → APPROVED
3. Buyer clicks "Pay with PayPal"  POST /v2/checkout/orders
4. Order is recorded               record_payment_order()        payments: CREATED
5. PAYER APPROVES in PayPal        (outside PACTO)
6. Returns to /pactos/[id]/pago    POST /v2/checkout/orders/{id}/capture
7. Result is recorded              record_payment_result()       → CAPTURED, milestone → PAID
8. (Backup) PayPal webhook         verified signature → same record_payment_result()
```

Step 2 is the **explicit human authorization** the brief requires. It is not a
UI check: `record_payment_order` rejects with `APPROVAL_REQUIRED` any attempt
to pay a milestone that is not in `APPROVED`.

## APIs used

| Operation | Endpoint |
|---|---|
| Token | `POST /v1/oauth2/token` (client credentials) |
| Create order | `POST /v2/checkout/orders` (intent `CAPTURE`) |
| Capture | `POST /v2/checkout/orders/{id}/capture` |
| Get status | `GET /v2/checkout/orders/{id}` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |

## Duplicate payment prevention

Four independent barriers:

1. **Idempotency in PayPal.** Each order creation sends `PayPal-Request-Id`
   with the milestone identifier; each capture sends `capture-<order_id>`.
   Repeating the request returns the same result instead of creating a new one.
2. **One live payment per milestone.** A unique partial index on `payments`
   prevents a second order while another is in `CREATED`, `APPROVED`, or
   `CAPTURED`. A cancelled or failed payment does release the milestone for
   retry.
3. **Idempotent capture in the database.** `record_payment_result` returns
   `ALREADY_CAPTURED` if the payment was already captured, without duplicating
   the audit trail. Reloading the return page does not charge again.
4. **Non-manipulable amount.** The amount is read from the milestone row in the
   database, and the function double-checks it: `AMOUNT_MISMATCH` if it does
   not match.

## Webhooks

- **Signature always verified.** `verifyWebhook()` sends the five transmission
  headers to PayPal's official verifier. It fails closed: without
  `PAYPAL_WEBHOOK_ID`, without headers, with an invalid body, or on any error,
  the notification is discarded with 401.
- **Handled events:** `PAYMENT.CAPTURE.COMPLETED` (marks paid),
  `PAYMENT.CAPTURE.DENIED` and `PAYMENT.CAPTURE.REVERSED` (mark failed).
  `PAYMENT.CAPTURE.REFUNDED` records the refund. Informational notifications
  are acknowledged without changing anything.
- **Secondary role.** The normal capture occurs on the payer's return. The
  webhook covers the case where that return is lost.
- **Optional reconciliation.** The notification arrives without a user session,
  so writing requires `SUPABASE_SERVICE_ROLE_KEY`. Without that key, the
  webhook verifies the signature, responds 200, and changes nothing.

## Refunds

Refund handling was implemented and verified on 12 October 2026:

- Migration `202610140001_refunds.sql` added the `refund_id` and `refunded_at`
  columns, the `REFUNDED` state, and the `record_payment_refund` RPC
  (executable only by `service_role`).
- Migration `202610150001_refund_by_capture.sql` enabled the refund webhook to
  locate the payment by its `capture_id` rather than the order id.
- A full Sandbox refund was verified end to end: `PAYMENT.CAPTURE.REFUNDED`
  webhook → signed verification → payment marked `REFUNDED`, milestone back to
  `APPROVED`, audit event `PAYMENT_REFUNDED`.

## Error handling

| Situation | Behavior |
|---|---|
| PayPal does not respond or returns error | Short code in server log; "Could not contact PayPal" in UI |
| Payer cancels in PayPal | Returns with milestone still authorized; can retry |
| Capture rejected (422) | Payment set to `FAILED`; milestone can be paid again |
| Return lost | Webhook reconciles, if configured |
| Return page reloaded | `CAPTURED` detected; no double charge |

Errors never include the PayPal response body, which may contain payer data:
only a code like `ORDER_HTTP_422`.

## Test status

| Test | Type | Result |
|---|---|---|
| Create order: amount, currency, idempotency, return URLs | API double | PASS |
| Capture: identifier and idempotency key | API double | PASS |
| Status query | API double | PASS |
| Token errors, incomplete order, capture 422 | API double | PASS |
| Authentic webhook accepted | API double | PASS |
| Forged webhook, missing id, missing headers, invalid JSON, error | API double | PASS |
| Never leaves Sandbox host | API double | PASS |
| Authorization, duplicates, amounts, capture idempotency | Real PostgreSQL | PASS |
| End-to-end payment with Sandbox account | Real Sandbox | Verified 12 Oct 2026 |
| End-to-end refund with Sandbox | Real Sandbox | Verified 12 Oct 2026 |
