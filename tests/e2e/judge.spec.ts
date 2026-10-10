import { expect, test, type Page } from "@playwright/test";

// Modo Juez: una sola persona, una sola ventana, el ciclo completo. Comprueba
// además que el cambio de rol NO relaja ninguna validación del servidor.

async function actAs(page: Page, role: "cliente" | "proveedor") {
  const button = page.getByRole("button", { name: new RegExp(`Actuar como ${role}`) });
  if (await button.isVisible()) {
    await button.click();
    await expect(page.getByText(`Actúas como ${role}`)).toBeVisible();
  }
}

test("a judge completes create → invite → join → accept → evidence → authorize → close alone", async ({ page }) => {
  await page.goto("/juez");
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();

  // 1. El formulario llega relleno con un escenario realista.
  await page.waitForURL(/\/pactos\/new/);
  await expect(page.locator('input[name="title"]')).toHaveValue("Rediseño de tienda en línea");
  await expect(page.locator('input[name="amount"]')).toHaveValue("25000");
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const pactoId = page.url().match(/\/pactos\/([0-9a-f-]{36})$/)![1];

  // 2. La barra dice quién eres; empiezas como cliente.
  await expect(page.getByText("MODO JUEZ")).toBeVisible();
  await expect(page.getByText("Actúas como cliente")).toBeVisible();

  // 3. Invitación y atajo para entrar como proveedor.
  await page.getByRole("button", { name: "Generar enlace de invitación" }).click();
  await expect(page.getByLabel("Enlace de invitación")).toHaveValue(/\/invitacion\/[0-9a-f]{64}$/);
  await page.getByRole("button", { name: /Abrir la invitación como proveedor/ }).click();
  await page.waitForURL(/\/invitacion\/[0-9a-f]{64}/);
  // La invitación vive fuera del espacio de trabajo: sin la barra, el evaluador
  // no sabría con cuál de las dos identidades DEMO está abriendo el enlace.
  await expect(page.getByText("Actúas como proveedor")).toBeVisible();
  await page.getByRole("button", { name: "Unirme como proveedor →" }).click();
  await page.waitForURL(new RegExp(`/pactos/${pactoId}`));
  await expect(page.getByText("Te uniste como proveedor")).toBeVisible();
  await expect(page.getByText("Actúas como proveedor")).toBeVisible();

  // 4. Revisión y aceptación por ambas partes, cambiando de identidad.
  await page.getByRole("button", { name: "Enviar a revisión →" }).click();
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expect(page.getByText("Esperando la aceptación de la otra parte")).toBeVisible();
  // La guía indica a quién le toca.
  await expect(page.getByText(/este paso le toca al cliente/)).toBeVisible();
  await actAs(page, "cliente");
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expect(page.locator(".badge").filter({ hasText: /Aceptado/ }).first()).toBeVisible();

  // 5. El cliente NO puede autorizar sin evidencia: el servidor manda, no la barra.
  await expect(page.getByRole("heading", { name: "Entregas y pagos" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Autorizar el pago/ })).toHaveCount(0);
  await expect(page.getByText(/este paso le toca al proveedor/)).toBeVisible();

  // 6. Evidencia como proveedor.
  await actAs(page, "proveedor");
  await page.locator('textarea[name="evidence"]').fill("Tienda publicada en el dominio del cliente y equipo capacitado.");
  await page.getByRole("button", { name: "Presentar evidencia" }).click();
  await expect(page.getByText("Evidencia presentada. El cliente la revisará")).toBeVisible();
  // El proveedor nunca puede autorizar su propio cobro, ni en Modo Juez.
  await expect(page.getByRole("button", { name: /Autorizar el pago/ })).toHaveCount(0);

  // 7. Autorización explícita del cliente.
  await actAs(page, "cliente");
  await expect(page.locator("blockquote.evidence")).toContainText("Tienda publicada");
  await page.getByRole("button", { name: "Autorizar el pago de este hito" }).click();
  await expect(page.getByText("Hito autorizado")).toBeVisible();

  // 8. El estado real de PayPal se muestra tal cual, sin simular un pago.
  const payButton = page.getByRole("button", { name: /Pagar .* con PayPal/ });
  if ((await payButton.count()) === 0) {
    await expect(page.getByText(/El pago con PayPal todavía no está activado/)).toBeVisible();
  }

  // 9. Cierre por ambas partes.
  await page.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(page.getByText("Esperando que la otra parte confirme el cierre")).toBeVisible();
  await actAs(page, "proveedor");
  await page.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(page.getByText("Ambas partes confirmaron. El Pacto está cerrado.")).toBeVisible();
  await expect(page.locator(".badge").filter({ hasText: /Cerrado/ }).first()).toBeVisible();
});

test("the two judge identities are genuinely different users, isolated by RLS", async ({ page, browser }) => {
  await page.goto("/juez");
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const pactoId = page.url().match(/\/pactos\/([0-9a-f-]{36})$/)![1];

  // El proveedor aún no participa: ve 404, igual que cualquier extraño.
  await page.getByRole("button", { name: /Actuar como proveedor/ }).click();
  await expect(page.getByText("Actúas como proveedor")).toBeVisible();
  const asSeller = await page.goto(`/pactos/${pactoId}`);
  expect(asSeller?.status()).toBe(404);

  // Y un visitante DEMO ajeno tampoco lo ve.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/demo");
  await otherPage.waitForURL(/\/pactos$/, { timeout: 15000 });
  expect((await otherPage.goto(`/pactos/${pactoId}`))?.status()).toBe(404);
  await other.close();
});

test("restarting the demo creates a fresh, separate scenario", async ({ page }) => {
  await page.goto("/juez");
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const first = page.url();

  await page.getByRole("link", { name: "Reiniciar demostración" }).click();
  await page.waitForURL(/\/juez$/);
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toBe(first);

  // El escenario anterior pertenece a otra identidad: no se borró, pero ya no es tuyo.
  expect((await page.goto(new URL(first).pathname))?.status()).toBe(404);
});

test("judge mode works on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/juez");
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Actúas como cliente")).toBeVisible();
  await expect(page.getByRole("button", { name: /Actuar como proveedor/ })).toBeVisible();
  // Sin desbordamiento horizontal en móvil.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
