import { expect, test } from "@playwright/test";
import { createPacto, enterDemo, expectBadge } from "./helpers";

// Recorrido completo como lo vive un juez: dos visitantes DEMO independientes
// (comprador y proveedor) en ventanas separadas, sin correos ni contraseñas.
test.describe.configure({ mode: "serial" });

test("two DEMO visitors complete create → invite → join → review → accept → close", async ({ browser }) => {
  const buyerContext = await browser.newContext();
  const sellerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  const seller = await sellerContext.newPage();
  try {
    await enterDemo(buyer);
    const pactoId = await createPacto(buyer, `Recorrido DEMO ${Date.now().toString(36)}`);

    // 1. El comprador ve un único siguiente paso, sin pedir identificadores técnicos.
    await expect(buyer.getByRole("heading", { name: "Invita a tu proveedor" })).toBeVisible();
    await expect(buyer.getByText(/UUID|Foundation|Command Center/i)).toHaveCount(0);
    await buyer.getByRole("button", { name: "Generar enlace de invitación" }).click();
    const link = new URL(await buyer.getByLabel("Enlace de invitación").inputValue());
    expect(link.pathname).toMatch(/^\/invitacion\/[0-9a-f]{64}$/);
    await expect(buyer.getByRole("link", { name: "Enviar por correo" })).toHaveAttribute("href", /^mailto:/);

    // 2. El proveedor abre el enlace sin sesión y entra como visitante DEMO.
    await seller.goto(link.pathname);
    await expect(seller.getByRole("heading", { name: "Únete al Pacto" })).toBeVisible();
    await seller.getByRole("link", { name: "Continuar como visitante DEMO" }).click();
    await seller.waitForURL(new RegExp(link.pathname));
    await expect(seller.getByText(/Recorrido DEMO/)).toBeVisible();
    await seller.getByRole("button", { name: "Unirme como proveedor →" }).click();
    await seller.waitForURL(new RegExp(`/pactos/${pactoId}`));
    await expect(seller.getByText("Te uniste como proveedor")).toBeVisible();

    // El enlace ya no sirve para nadie más.
    await seller.goto(link.pathname);
    await expect(seller.getByRole("heading", { name: "Ya eres parte de este Pacto" })).toBeVisible();

    // 3. Cualquiera de las partes envía a revisión.
    await buyer.goto(`/pactos/${pactoId}`);
    await buyer.getByRole("button", { name: "Enviar a revisión →" }).click();
    await expectBadge(buyer, /En revisión/);

    // 4b. Ambas aceptan; quien acepta primero ve a quién espera.
    await seller.goto(`/pactos/${pactoId}`);
    await seller.getByRole("button", { name: /Aceptar versión 1/ }).click();
    await expect(seller.getByText("Esperando la aceptación de la otra parte")).toBeVisible();
    await buyer.goto(`/pactos/${pactoId}`);
    await buyer.getByRole("button", { name: /Aceptar versión 1/ }).click();
    await expectBadge(buyer, /Aceptado/);

    // 5. Entregas y pagos: el proveedor presenta evidencia, el cliente autoriza.
    await expect(buyer.getByRole("heading", { name: "Entregas y pagos" })).toBeVisible();
    await expect(buyer.getByText("Esperando que el proveedor presente la evidencia")).toBeVisible();
    // El cliente no puede autorizar sin evidencia.
    await expect(buyer.getByRole("button", { name: /Autorizar el pago/ })).toHaveCount(0);

    await seller.goto(`/pactos/${pactoId}`);
    await seller.locator('textarea[name="evidence"]').fill("Entrega publicada y revisada con el cliente en el recorrido DEMO.");
    await seller.getByRole("button", { name: "Presentar evidencia" }).click();
    await expect(seller.getByText("Evidencia presentada. El cliente la revisará")).toBeVisible();
    // El proveedor no puede autorizar su propio cobro.
    await expect(seller.getByRole("button", { name: /Autorizar el pago/ })).toHaveCount(0);

    await buyer.goto(`/pactos/${pactoId}`);
    // La evidencia se ve en el hito y queda además registrada en la actividad.
    await expect(buyer.locator("blockquote.evidence")).toContainText("Entrega publicada y revisada");
    await expect(buyer.locator(".audit-card")).toContainText("Evidencia de entrega presentada");
    await buyer.getByRole("button", { name: "Autorizar el pago de este hito" }).click();
    await expect(buyer.getByText("Hito autorizado")).toBeVisible();
    // Sin credenciales de PayPal, se explica en vez de ofrecer un botón que fallaría.
    const payButton = buyer.getByRole("button", { name: /Pagar .* con PayPal/ });
    if ((await payButton.count()) === 0) {
      await expect(buyer.getByText(/El pago con PayPal todavía no está activado/)).toBeVisible();
    }

    // 6. Ambas confirman el cierre.
    await expect(buyer.getByRole("heading", { name: /Confirma el cierre/ })).toBeVisible();
    await buyer.locator('textarea[name="note"]').fill("Entrega revisada en el recorrido DEMO");
    await buyer.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(buyer.getByText("Esperando que la otra parte confirme el cierre")).toBeVisible();
    await seller.goto(`/pactos/${pactoId}`);
    await seller.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(seller.getByText("Ambas partes confirmaron. El Pacto está cerrado.")).toBeVisible();
    await expect(seller.getByRole("heading", { name: "Pacto cerrado" })).toBeVisible();
    await expectBadge(seller, /Cerrado/);

    // La actividad muestra personas, no identificadores.
    await expect(seller.locator(".audit-card")).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  } finally {
    await buyerContext.close();
    await sellerContext.close();
  }
});
