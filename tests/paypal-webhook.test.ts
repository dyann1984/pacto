import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El manejador del webhook de PayPal. `tests/paypal.test.ts` cubre la verificación de
 * firma contra PayPal; aquí se cubre la ruta: que falle cerrado sin firma válida, que
 * solo los avisos de captura cambien estados, y que nunca registre el cuerpo del aviso.
 *
 * Es la única vía de escritura que llega sin sesión de usuario, así que su única
 * autorización es la firma: si esta prueba se rompe, cualquiera podría marcar pagos.
 */

vi.mock("server-only", () => ({}));

const verifyWebhook = vi.fn();
const isConfigured = vi.fn();
const rpc = vi.fn();
const supabaseService = vi.fn();
// Búsqueda de la orden por captura (`payments.capture_id`), para reembolsos.
const lookup = vi.fn();
const eq = vi.fn(() => ({ maybeSingle: lookup }));
const from = vi.fn(() => ({ select: () => ({ eq }) }));

vi.mock("@/lib/paypal", () => ({ verifyWebhook }));
vi.mock("@/lib/supabase", () => ({ isConfigured }));
vi.mock("@/lib/supabase-service", () => ({ supabaseService }));

const { POST } = await import("@/app/api/paypal/webhook/route");

function post(body: unknown) {
  return new Request("https://pacto.example/api/paypal/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const captureCompleted = {
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: "CAPTURE-9",
    supplementary_data: { related_ids: { order_id: "ORDER-9" } },
  },
};

beforeEach(() => {
  verifyWebhook.mockReset();
  isConfigured.mockReset();
  rpc.mockReset();
  supabaseService.mockReset();
  lookup.mockReset();
  eq.mockClear();
  isConfigured.mockReturnValue(true);
  rpc.mockResolvedValue({ error: null });
  lookup.mockResolvedValue({ data: null, error: null });
  supabaseService.mockReturnValue({ rpc, from });
});

describe("webhook de PayPal: la firma es la única autorización", () => {
  it("rejects an unverified notification with 401 and writes nothing", async () => {
    verifyWebhook.mockResolvedValue(false);
    const response = await POST(post(captureCompleted));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(supabaseService).not.toHaveBeenCalled();
  });

  it("records a verified capture against the order PACTO created", async () => {
    verifyWebhook.mockResolvedValue(true);
    const response = await POST(post(captureCompleted));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_payment_result", {
      p_order_id: "ORDER-9",
      p_status: "CAPTURED",
      p_capture_id: "CAPTURE-9",
    });
  });

  it("marks a denied capture as failed, without a capture id", async () => {
    verifyWebhook.mockResolvedValue(true);
    await POST(post({ ...captureCompleted, event_type: "PAYMENT.CAPTURE.DENIED" }));
    expect(rpc).toHaveBeenCalledWith("record_payment_result", {
      p_order_id: "ORDER-9",
      p_status: "FAILED",
      p_capture_id: null,
    });
  });

  it("acknowledges informational events without changing any state", async () => {
    verifyWebhook.mockResolvedValue(true);
    // Orden aprobada: PACTO captura en el retorno del pagador, no aquí.
    const approved = await POST(post({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER-9" } }));
    expect(approved.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    // Un aviso sin orden identificable tampoco toca nada.
    await POST(post({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }));
    expect(rpc).not.toHaveBeenCalled();
  });

  // Un reembolso o una reversión devuelven el dinero: el hito deja de constar pagado.
  // Antes REVERSED se trataba como fallo y, al estar ya capturado, no cambiaba nada.
  it("registra un reembolso o una reversión confirmados por PayPal", async () => {
    verifyWebhook.mockResolvedValue(true);
    for (const type of ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"]) {
      rpc.mockClear();
      const response = await POST(post({ ...captureCompleted, event_type: type }));
      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith("record_payment_refund", {
        p_order_id: "ORDER-9",
        p_refund_id: "CAPTURE-9",
      });
    }
  });

  it("treats DECLINED (Payments v2 name) like DENIED", async () => {
    verifyWebhook.mockResolvedValue(true);
    await POST(post({ ...captureCompleted, event_type: "PAYMENT.CAPTURE.DECLINED" }));
    expect(rpc).toHaveBeenCalledWith("record_payment_result", {
      p_order_id: "ORDER-9",
      p_status: "FAILED",
      p_capture_id: null,
    });
  });

  // El recurso de PAYMENT.CAPTURE.REFUNDED es el reembolso, no la captura: puede no traer
  // el order_id. La orden se obtiene de la captura enlazada con rel "up".
  it("resolves a refund without order_id through the capture it points to", async () => {
    verifyWebhook.mockResolvedValue(true);
    lookup.mockResolvedValue({ data: { order_id: "ORDER-9" }, error: null });
    const refund = {
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: {
        id: "REFUND-1",
        links: [
          { rel: "self", href: "https://api.sandbox.paypal.com/v2/payments/refunds/REFUND-1" },
          { rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE-9" },
        ],
      },
    };
    expect((await POST(post(refund))).status).toBe(200);
    expect(eq).toHaveBeenCalledWith("capture_id", "CAPTURE-9");
    expect(rpc).toHaveBeenCalledWith("record_payment_refund", {
      p_order_id: "ORDER-9",
      p_refund_id: "REFUND-1",
    });
  });

  it("writes nothing when a refund points to a capture PACTO does not know", async () => {
    verifyWebhook.mockResolvedValue(true);
    const refund = {
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { id: "REFUND-2", links: [{ rel: "up", href: "https://x/v2/payments/captures/AJENA-1" }] },
    };
    expect((await POST(post(refund))).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 on a verified notification whose body is not JSON", async () => {
    verifyWebhook.mockResolvedValue(true);
    expect((await POST(post("no es json"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("acknowledges without writing when reconciliation is not configured", async () => {
    verifyWebhook.mockResolvedValue(true);
    supabaseService.mockReturnValue(null);
    const response = await POST(post(captureCompleted));
    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("acknowledges a write failure instead of inviting an endless retry", async () => {
    verifyWebhook.mockResolvedValue(true);
    rpc.mockResolvedValue({ error: { message: "NOT_FOUND" } });
    expect((await POST(post(captureCompleted))).status).toBe(200);
  });

  it("does not even verify when Supabase is not configured", async () => {
    isConfigured.mockReturnValue(false);
    const response = await POST(post(captureCompleted));
    expect(response.status).toBe(200);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });
});
