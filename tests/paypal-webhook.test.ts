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
  isConfigured.mockReturnValue(true);
  rpc.mockResolvedValue({ error: null });
  supabaseService.mockReturnValue({ rpc });
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

  it("marks a denied or reversed capture as failed, without a capture id", async () => {
    verifyWebhook.mockResolvedValue(true);
    for (const type of ["PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REVERSED"]) {
      rpc.mockClear();
      await POST(post({ ...captureCompleted, event_type: type }));
      expect(rpc).toHaveBeenCalledWith("record_payment_result", {
        p_order_id: "ORDER-9",
        p_status: "FAILED",
        p_capture_id: null,
      });
    }
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

  it("LIMITACIÓN CONOCIDA: un reembolso se reconoce pero no revierte el hito", async () => {
    // PACTO no implementa reembolsos todavía: PAYMENT.CAPTURE.REFUNDED no está en el
    // mapa de estados, así que el aviso se acepta y no cambia nada. Queda fijado aquí
    // para que el día que se implementen, esta prueba obligue a actualizarla.
    verifyWebhook.mockResolvedValue(true);
    const response = await POST(post({ ...captureCompleted, event_type: "PAYMENT.CAPTURE.REFUNDED" }));
    expect(response.status).toBe(200);
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
