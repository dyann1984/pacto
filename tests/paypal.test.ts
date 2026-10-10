import { afterEach, describe, expect, it, vi } from "vitest";

// paypal.ts es código de servidor: en pruebas se neutraliza el guardia de Next.
vi.mock("server-only", () => ({}));

import {
  captureOrder,
  createOrder,
  getOrderStatus,
  isPayPalConfigured,
  verifyWebhook,
} from "../src/lib/paypal";

const ORDER_INPUT = {
  amountCents: 250000,
  currency: "MXN" as const,
  reference: "milestone-abc",
  description: "Hito: Entrega acordada",
  returnUrl: "https://pacto.example/pactos/1?pago=ok",
  cancelUrl: "https://pacto.example/pactos/1?pago=cancelado",
};

function withCredentials() {
  vi.stubEnv("PAYPAL_CLIENT_ID", "sandbox-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "sandbox-secret");
}

/** Doble del API de PayPal: registra cada petición y responde lo indicado. */
function fakePayPal(routes: Record<string, { ok?: boolean; status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    const key = Object.keys(routes).find((k) => href.includes(k));
    const route = key ? routes[key] : undefined;
    if (!route) throw new Error(`ruta no simulada: ${href}`);
    return {
      ok: route.ok ?? true,
      status: route.status ?? 200,
      json: async () => route.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const tokenRoute = { "/v1/oauth2/token": { body: { access_token: "token-de-prueba" } } };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PayPal: configuración y entorno", () => {
  it("reports not configured when credentials are missing", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    expect(isPayPalConfigured()).toBe(false);
    const { impl } = fakePayPal({});
    expect(await createOrder(ORDER_INPUT, impl)).toEqual({ status: "NOT_CONFIGURED" });
  });

  it("always targets the sandbox host, even if a live base is configured", async () => {
    withCredentials();
    vi.stubEnv("PAYPAL_API_BASE", "https://api-m.paypal.com");
    const { impl, calls } = fakePayPal({
      ...tokenRoute,
      "/v2/checkout/orders": { body: { id: "ORDER-1", links: [{ rel: "payer-action", href: "https://sandbox.paypal.com/x" }] } },
    });
    await createOrder(ORDER_INPUT, impl);
    expect(calls.every((c) => c.url.startsWith("https://api-m.sandbox.paypal.com"))).toBe(true);
  });
});

describe("PayPal: órdenes", () => {
  it("creates an order with the exact amount, currency and idempotency key", async () => {
    withCredentials();
    const { impl, calls } = fakePayPal({
      ...tokenRoute,
      "/v2/checkout/orders": { body: { id: "ORDER-1", links: [{ rel: "payer-action", href: "https://sandbox.paypal.com/checkout" }] } },
    });
    const result = await createOrder(ORDER_INPUT, impl);
    expect(result).toEqual({ status: "OK", data: { orderId: "ORDER-1", approveUrl: "https://sandbox.paypal.com/checkout" } });

    const order = calls.find((c) => c.url.includes("/v2/checkout/orders"))!;
    const headers = order.init.headers as Record<string, string>;
    expect(headers["paypal-request-id"]).toBe("milestone-abc");
    const body = JSON.parse(String(order.init.body));
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "MXN", value: "2500.00" });
    expect(body.payment_source.paypal.experience_context.return_url).toBe(ORDER_INPUT.returnUrl);
  });

  it("reuses the same idempotency key for the same reference", async () => {
    withCredentials();
    const { impl, calls } = fakePayPal({
      ...tokenRoute,
      "/v2/checkout/orders": { body: { id: "ORDER-1", links: [{ rel: "approve", href: "https://sandbox.paypal.com/checkout" }] } },
    });
    await createOrder(ORDER_INPUT, impl);
    await createOrder(ORDER_INPUT, impl);
    const keys = calls
      .filter((c) => c.url.includes("/v2/checkout/orders"))
      .map((c) => (c.init.headers as Record<string, string>)["paypal-request-id"]);
    expect(new Set(keys).size).toBe(1);
  });

  it("surfaces a short error code and never the provider body", async () => {
    withCredentials();
    const { impl } = fakePayPal({
      ...tokenRoute,
      "/v2/checkout/orders": { ok: false, status: 422, body: { details: [{ issue: "PAYER_ACTION_REQUIRED", description: "datos del pagador" }] } },
    });
    expect(await createOrder(ORDER_INPUT, impl)).toEqual({ status: "ERROR", code: "ORDER_HTTP_422" });
  });

  it("rejects an order response without an approval link", async () => {
    withCredentials();
    const { impl } = fakePayPal({ ...tokenRoute, "/v2/checkout/orders": { body: { id: "ORDER-1", links: [] } } });
    expect(await createOrder(ORDER_INPUT, impl)).toEqual({ status: "ERROR", code: "ORDER_INCOMPLETE" });
  });

  it("fails when the token request is rejected", async () => {
    withCredentials();
    const { impl } = fakePayPal({ "/v1/oauth2/token": { ok: false, status: 401 } });
    expect(await createOrder(ORDER_INPUT, impl)).toEqual({ status: "ERROR", code: "TOKEN_HTTP_401" });
  });
});

describe("PayPal: captura y estado", () => {
  it("captures an approved order and returns the capture id", async () => {
    withCredentials();
    const { impl, calls } = fakePayPal({
      ...tokenRoute,
      "/capture": { body: { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAPTURE-1", status: "COMPLETED" }] } }] } },
    });
    expect(await captureOrder("ORDER-1", impl)).toEqual({ status: "OK", data: { captureId: "CAPTURE-1", status: "COMPLETED" } });
    const headers = calls.find((c) => c.url.includes("/capture"))!.init.headers as Record<string, string>;
    expect(headers["paypal-request-id"]).toBe("capture-ORDER-1");
  });

  it("treats an already-captured or unapproved order as a handled error", async () => {
    withCredentials();
    const { impl } = fakePayPal({ ...tokenRoute, "/capture": { ok: false, status: 422 } });
    expect(await captureOrder("ORDER-1", impl)).toEqual({ status: "ERROR", code: "CAPTURE_HTTP_422" });
  });

  it("reads an order status", async () => {
    withCredentials();
    const { impl } = fakePayPal({ ...tokenRoute, "/v2/checkout/orders/ORDER-1": { body: { status: "APPROVED" } } });
    expect(await getOrderStatus("ORDER-1", impl)).toEqual({ status: "OK", data: "APPROVED" });
  });
});

describe("PayPal: webhooks", () => {
  const signedHeaders = () =>
    new Headers({
      "paypal-transmission-id": "t-1",
      "paypal-transmission-time": "2026-10-12T00:00:00Z",
      "paypal-transmission-sig": "firma",
      "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
      "paypal-auth-algo": "SHA256withRSA",
    });

  it("accepts a webhook that PayPal verifies as authentic", async () => {
    withCredentials();
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { impl, calls } = fakePayPal({ ...tokenRoute, "/verify-webhook-signature": { body: { verification_status: "SUCCESS" } } });
    expect(await verifyWebhook(signedHeaders(), '{"event_type":"CHECKOUT.ORDER.APPROVED"}', impl)).toBe(true);
    const sent = JSON.parse(String(calls.find((c) => c.url.includes("/verify-webhook-signature"))!.init.body));
    expect(sent.webhook_id).toBe("WH-1");
    expect(sent.transmission_sig).toBe("firma");
  });

  it("rejects a forged webhook that PayPal does not verify", async () => {
    withCredentials();
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { impl } = fakePayPal({ ...tokenRoute, "/verify-webhook-signature": { body: { verification_status: "FAILURE" } } });
    expect(await verifyWebhook(signedHeaders(), "{}", impl)).toBe(false);
  });

  it("fails closed without a webhook id, without signature headers or with invalid JSON", async () => {
    withCredentials();
    const { impl } = fakePayPal({ ...tokenRoute, "/verify-webhook-signature": { body: { verification_status: "SUCCESS" } } });
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    expect(await verifyWebhook(signedHeaders(), "{}", impl)).toBe(false);

    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    expect(await verifyWebhook(new Headers({ "paypal-transmission-id": "t-1" }), "{}", impl)).toBe(false);
    expect(await verifyWebhook(signedHeaders(), "no es json", impl)).toBe(false);
  });

  it("fails closed when the verification call itself errors", async () => {
    withCredentials();
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-1");
    const { impl } = fakePayPal({ ...tokenRoute, "/verify-webhook-signature": { ok: false, status: 500 } });
    expect(await verifyWebhook(signedHeaders(), "{}", impl)).toBe(false);
  });
});
