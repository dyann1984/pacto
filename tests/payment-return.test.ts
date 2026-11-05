import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Retorno desde PayPal. Es el único lugar donde PACTO afirma que un hito quedó pagado, así
 * que aquí se fija lo que nunca debe ocurrir: registrar como cobrada una captura pendiente,
 * capturar una orden ya cerrada, o dejar abierta una orden cancelada.
 */

vi.mock("server-only", () => ({}));

class Redirect extends Error {
  constructor(public url: string) {
    super(url);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Redirect("404");
  },
}));

const captureOrder = vi.fn();
const getOrderStatus = vi.fn();
vi.mock("@/lib/paypal", () => ({ captureOrder, getOrderStatus, isPayPalConfigured: () => true }));

const userRpc = vi.fn();
const payment = vi.fn();
const query = { select: () => query, eq: () => query, maybeSingle: payment };
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ db: { from: () => query, rpc: userRpc } }),
}));

const serviceRpc = vi.fn();
vi.mock("@/lib/supabase-service", () => ({ supabaseService: () => ({ rpc: serviceRpc }) }));

const { default: PaymentReturn } = await import("@/app/pactos/[id]/pago/page");

const PACTO = "11111111-1111-4111-8111-111111111111";

async function land(search: Record<string, string>) {
  try {
    await PaymentReturn({ params: Promise.resolve({ id: PACTO }), searchParams: Promise.resolve(search) });
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  return "sin redirección";
}

beforeEach(() => {
  for (const f of [captureOrder, getOrderStatus, userRpc, payment, serviceRpc]) f.mockReset();
  payment.mockResolvedValue({ data: { id: "p1", status: "CREATED", order_id: "ORDER-1" }, error: null });
  userRpc.mockResolvedValue({ error: null });
  serviceRpc.mockResolvedValue({ error: null });
});

describe("retorno de PayPal", () => {
  it("records a COMPLETED capture through the service role", async () => {
    captureOrder.mockResolvedValue({ status: "OK", data: { captureId: "CAP-1", status: "COMPLETED" } });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=pagado`);
    expect(serviceRpc).toHaveBeenCalledWith("record_payment_result", {
      p_order_id: "ORDER-1",
      p_status: "CAPTURED",
      p_capture_id: "CAP-1",
    });
  });

  it("never records a PENDING capture as paid", async () => {
    captureOrder.mockResolvedValue({ status: "OK", data: { captureId: "CAP-1", status: "PENDING" } });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=pendiente`);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("closes the order when the payer cancels, so the milestone can be paid again", async () => {
    expect(await land({ token: "ORDER-1", cancelado: "1" })).toBe(`/pactos/${PACTO}?pago=cancelado`);
    expect(userRpc).toHaveBeenCalledWith("record_payment_result", { p_order_id: "ORDER-1", p_status: "CANCELLED" });
    expect(captureOrder).not.toHaveBeenCalled();
  });

  it("does not capture an order that is no longer open (avoids a double charge)", async () => {
    for (const status of ["CANCELLED", "FAILED", "REFUNDED"]) {
      payment.mockResolvedValue({ data: { id: "p1", status, order_id: "ORDER-1" }, error: null });
      expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=failed`);
    }
    expect(captureOrder).not.toHaveBeenCalled();
  });

  it("does not mark as failed an order PayPal already completed", async () => {
    captureOrder.mockResolvedValue({ status: "ERROR", code: "CAPTURE_HTTP_500" });
    getOrderStatus.mockResolvedValue({ status: "OK", data: "COMPLETED" });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=conciliacion`);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("closes the order only on a definitive PayPal rejection", async () => {
    getOrderStatus.mockResolvedValue({ status: "OK", data: "APPROVED" });
    captureOrder.mockResolvedValue({ status: "ERROR", code: "CAPTURE_HTTP_422" });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=rechazado`);
    expect(userRpc).toHaveBeenCalledWith("record_payment_result", { p_order_id: "ORDER-1", p_status: "FAILED" });

    userRpc.mockClear();
    captureOrder.mockResolvedValue({ status: "ERROR", code: "CAPTURE_HTTP_503" });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=proveedor`);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("an already captured order is reported as paid without calling PayPal", async () => {
    payment.mockResolvedValue({ data: { id: "p1", status: "CAPTURED", order_id: "ORDER-1" }, error: null });
    expect(await land({ token: "ORDER-1" })).toBe(`/pactos/${PACTO}?pago=pagado`);
    expect(captureOrder).not.toHaveBeenCalled();
  });
});
