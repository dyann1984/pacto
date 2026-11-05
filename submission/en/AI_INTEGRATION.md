# AI integration

## Provider and model

- **Provider:** Anthropic API (`POST /v1/messages`), called directly with
  `fetch` from the server.
- **Default model:** `claude-sonnet-5-5`, configurable via `ANTHROPIC_MODEL`.
- **Location:** `src/lib/ai.ts` (transport) and
  `src/domain/agreement-analysis.ts` (prompt construction and output
  validation).

## What it does

It analyzes the scope and amounts of an agreement version **before** either
party commits, and returns:

- A **summary** of what the agreement actually says.
- A list of **findings**, each with category (`AMBIGUITY`, `OBLIGATION`,
  `DATE`, `RISK`, `INCONSISTENCY`), severity, the **exact quote** from the
  text that triggered it, an explanation, and an improvement suggestion.
- Its own **limitations**, shown alongside the result.

The categories cover what the hackathon brief asks for: clarity, risks,
ambiguous conditions, missing information, and improvement proposals.

## What it does NOT do, by design

The AI **cannot** change the agreement, accept on anyone's behalf, confirm a
closure, or authorize a payment. This is not a promise in copy — the server
function that invokes it only has permission to write to `ai_analyses`, and
paying requires a person to have set the milestone to `APPROVED`. There is no
code path through which generated text can move money.

The result is always presented as assistance, not as definitive legal advice,
and the system prompt tells the model this explicitly.

## Security

- **Prompt injection:** the agreement scope is written by the other party, so
  it is untrusted data. It goes inside a delimited block of the user message,
  never in the system prompt, and the output **is not interpreted as
  instructions**: it is validated against a strict Zod schema. Any response
  that does not fit is rejected with `INVALID_OUTPUT` and nothing is shown.
- **Input validation:** the scope is limited to 5,000 characters by the
  database; amounts are bounded integers.
- **Traceability:** every analysis is stored with the model used and a SHA-256
  hash of the input, so a result can always be tied to the text it judged.
- **No secret leaks:** errors are reduced to short codes like
  `PROVIDER_HTTP_429`; neither the key nor the response body is ever logged.

## Cost control

- **Limit of 3 analyses per agreement version**, checked on the server before
  calling the provider. This matters because any anonymous DEMO visitor can
  press the button.
- **Per-person cap of 6 analyses per day**, enforced by the database.
- **`max_tokens` set to 16,000.** Current models reason before answering and
  that reasoning counts as output; with the previous value (2,000) the JSON
  could arrive truncated. Only generated tokens are billed, not the maximum.
- **90-second timeout**, with the error treated as a normal failure.
- **Refusals and truncated responses** (`stop_reason` `refusal` or
  `max_tokens`) are treated as errors, never shown as an analysis.

Approximate cost per analysis with a typical agreement (~1,500 input tokens):

| Model | Input / output per million | Per analysis |
|---|---|---|
| `claude-haiku-5-5` | $0.10 / $0.50 | ~$0.001–0.002 |
| `claude-sonnet-5-5` (current) | $2 / $10 | ~$0.02–0.04 |
| `claude-opus-5-5` | $4 / $20 | ~$0.04–0.08 |

## Test status

| Test | Type | Result |
|---|---|---|
| Prompt construction and SHA-256 input hash | Unit | PASS |
| Strict output validation; invalid JSON rejection | Unit | PASS |
| Without configured key returns `NOT_CONFIGURED`, not a fake result | Unit | PASS |
| Provider error is converted to a short code (`PROVIDER_HTTP_401`) | API double | PASS |
| The interface explains the feature is not active instead of showing a button | End-to-end | PASS |
| Real analysis against the Anthropic API | Real provider | Verified in production on 12 Oct 2026 |
