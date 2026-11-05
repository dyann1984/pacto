import "server-only";

// Integración con PayPal, exclusivamente en el entorno Sandbox: ninguna llamada
// mueve dinero real. PACTO nunca recibe ni almacena datos de tarjeta: el pagador
// introduce sus datos en el propio PayPal y aquí solo viajan identificadores.
//
// PACTO no retiene fondos ni actúa como escrow: el pago va del cliente al
// proveedor dentro de PayPal, y PACTO registra el resultado para la trazabilidad.

const SANDBOX_API = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 20_000;

export type PayPalOutcome<T> =
  | { status: "NOT_CONFIGURED" }
  | { status: "OK"; data: T }
  | { status: "ERROR"; code: string };

export type CreatedOrder = { orderId: string; approveUrl: string };
export type CaptureResult = { captureId: string; status: string };

type FetchLike = typeof fetch;

export function isPayPalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function apiBase() {
  // Puerta de seguridad: solo Sandbox. Una configuración que apunte a producción
  // se ignora deliberadamente para que el concurso no pueda generar cobros reales.
  return process.env.PAYPAL_API_BASE === SANDBOX_API ? SANDBOX_API : SANDBOX_API;
}

// El error se reduce a un código corto: nunca se registran cuerpos de PayPal,
// que pueden incluir datos del pagador.
function errorCode(prefix: string, status: number) {
  return `${prefix}_HTTP_${status}`;
}

async function accessToken(fetchImpl: FetchLike): Promise<PayPalOutcome<string>> {
  if (!isPayPalConfigured()) return { status: "NOT_CONFIGURED" };
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const response = await fetchImpl(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { status: "ERROR", code: errorCode("TOKEN", response.status) };
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) return { status: "ERROR", code: "TOKEN_MISSING" };
  return { status: "OK", data: body.access_token };
}

/**
 * Crea una orden de pago. `requestId` la hace idempotente en PayPal: repetir la
 * misma petición devuelve la misma orden en vez de crear una segunda.
 */
export async function createOrder(
  input: { amountCents: number; currency: "MXN"; reference: string; description: string; returnUrl: string; cancelUrl: string },
  fetchImpl: FetchLike = fetch,
  requestId = input.reference,
): Promise<PayPalOutcome<CreatedOrder>> {
  const token = await accessToken(fetchImpl);
  if (token.status !== "OK") return token;
  const response = await fetchImpl(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.data}`,
      "content-type": "application/json",
      "paypal-request-id": requestId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.reference,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: (input.amountCents / 100).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { status: "ERROR", code: errorCode("ORDER", response.status) };
  const body = (await response.json()) as {
    id?: string;
    links?: { rel: string; href: string }[];
  };
  const approveUrl = body.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!body.id || !approveUrl) return { status: "ERROR", code: "ORDER_INCOMPLETE" };
  return { status: "OK", data: { orderId: body.id, approveUrl } };
}

/** Captura una orden ya aprobada por el pagador. Idempotente por `orderId`. */
export async function captureOrder(
  orderId: string,
  fetchImpl: FetchLike = fetch,
): Promise<PayPalOutcome<CaptureResult>> {
  const token = await accessToken(fetchImpl);
  if (token.status !== "OK") return token;
  const response = await fetchImpl(`${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.data}`,
      "content-type": "application/json",
      "paypal-request-id": `capture-${orderId}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 422 suele significar que la orden ya se capturó o que el pagador no aprobó.
  if (!response.ok) return { status: "ERROR", code: errorCode("CAPTURE", response.status) };
  const body = (await response.json()) as {
    status?: string;
    purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
  };
  const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id) return { status: "ERROR", code: "CAPTURE_INCOMPLETE" };
  return { status: "OK", data: { captureId: capture.id, status: capture.status ?? body.status ?? "COMPLETED" } };
}

/** Consulta el estado de una orden sin modificarla. */
export async function getOrderStatus(
  orderId: string,
  fetchImpl: FetchLike = fetch,
): Promise<PayPalOutcome<string>> {
  const token = await accessToken(fetchImpl);
  if (token.status !== "OK") return token;
  const response = await fetchImpl(`${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { authorization: `Bearer ${token.data}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { status: "ERROR", code: errorCode("STATUS", response.status) };
  const body = (await response.json()) as { status?: string };
  if (!body.status) return { status: "ERROR", code: "STATUS_MISSING" };
  return { status: "OK", data: body.status };
}

/**
 * Verifica que un webhook procede realmente de PayPal. Falla cerrado: sin
 * PAYPAL_WEBHOOK_ID, o ante cualquier error, el aviso se descarta.
 */
export async function verifyWebhook(
  headers: Headers,
  rawBody: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !isPayPalConfigured()) return false;
  const required = [
    "paypal-transmission-id",
    "paypal-transmission-time",
    "paypal-transmission-sig",
    "paypal-cert-url",
    "paypal-auth-algo",
  ] as const;
  const values = required.map((h) => headers.get(h));
  if (values.some((v) => !v)) return false;
  const token = await accessToken(fetchImpl);
  if (token.status !== "OK") return false;
  // El cuerpo debe ser un objeto JSON válido; solo entonces se puede insertar tal cual.
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  } catch {
    return false;
  }
  // La firma de PayPal cubre los bytes exactos del aviso. Volver a serializarlo
  // (JSON.parse + JSON.stringify) puede cambiar escapes o números y hacer fallar una
  // verificación legítima, así que el evento viaja sin tocar.
  const envelope = JSON.stringify({
    transmission_id: values[0],
    transmission_time: values[1],
    transmission_sig: values[2],
    cert_url: values[3],
    auth_algo: values[4],
    webhook_id: webhookId,
  });
  const response = await fetchImpl(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { authorization: `Bearer ${token.data}`, "content-type": "application/json" },
    body: `${envelope.slice(0, -1)},"webhook_event":${rawBody}}`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { verification_status?: string };
  return body.verification_status === "SUCCESS";
}
