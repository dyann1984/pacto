import { expect, test, type Page } from "@playwright/test";

// Capturas para Devpost. Bajo demanda, fuera de la suite habitual:
//   PACTO_E2E_SHOTS=1 PACTO_E2E_BASE_URL=https://pacto-pearl.vercel.app \
//     pnpm exec playwright test tests/e2e/devpost-shots.spec.ts
//
// Recorre el Modo Juez como un jurado: gasta dos sesiones anónimas y UN análisis real con
// IA (dentro del cupo). NO crea ningún pago: se detiene en el botón de PayPal sin pulsarlo.
test.skip(!process.env.PACTO_E2E_SHOTS, "Capturas bajo demanda: PACTO_E2E_SHOTS=1");
test.setTimeout(300_000);

const OUT = "submission/screenshots";
const DESKTOP = { width: 1440, height: 900 };

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

test.use({ viewport: DESKTOP, deviceScaleFactor: 2 });

test("capturas de Devpost: portada, IA, entregas y PayPal, en escritorio y móvil", async ({ page, browser }) => {
  // 1. Portada
  await page.goto("/");
  await settle(page);
  await page.screenshot({ path: `${OUT}/01-portada.png` });
  await page.locator("#proceso").scrollIntoViewIfNeeded();
  await page.locator("#proceso").screenshot({ path: `${OUT}/02-como-funciona.png` });

  // 2. Modo Juez
  await page.goto("/juez");
  await settle(page);
  await page.screenshot({ path: `${OUT}/03-modo-juez.png` });
  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await settle(page);
  await page.screenshot({ path: `${OUT}/04-crear-pacto.png` });
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const id = page.url().match(/\/pactos\/([0-9a-f-]{36})$/)![1];

  // 3. Análisis real con IA
  const ai = page.locator("section.card").filter({ has: page.getByRole("heading", { name: "Análisis con IA" }) });
  await ai.getByRole("button", { name: /Analizar versión 1/ }).click();
  await expect(ai.getByRole("button", { name: /Analizando el acuerdo/ })).toBeDisabled();
  await ai.screenshot({ path: `${OUT}/05-ia-analizando.png` });
  await expect(page.getByText("Análisis registrado")).toBeVisible({ timeout: 95_000 });
  await settle(page);
  await ai.screenshot({ path: `${OUT}/06-ia-hallazgos.png` });

  // 4. Invitación segura y aceptación de ambas partes
  await page.getByRole("button", { name: "Generar enlace de invitación" }).click();
  await expect(page.getByLabel("Enlace de invitación")).toBeVisible();
  await page.locator("section.next-step").screenshot({ path: `${OUT}/07-invitacion.png` });
  await page.getByRole("button", { name: /Abrir la invitación como proveedor/ }).click();
  await page.waitForURL(/\/invitacion\//);
  await settle(page);
  await page.screenshot({ path: `${OUT}/08-invitacion-proveedor.png` });
  await page.getByRole("button", { name: "Unirme como proveedor →" }).click();
  await page.waitForURL(new RegExp(`/pactos/${id}`));
  await page.getByRole("button", { name: "Enviar a revisión →" }).click();
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await page.getByRole("button", { name: /Actuar como cliente/ }).click();
  await expect(page.getByRole("button", { name: /Aceptar versión 1/ })).toBeVisible();
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expect(page.locator(".badge").filter({ hasText: /Aceptado/ }).first()).toBeVisible();

  // 5. Evidencia del proveedor y autorización del cliente
  await page.getByRole("button", { name: /Actuar como proveedor/ }).click();
  await expect(page.locator('textarea[name="evidence"]')).toBeVisible();
  await page
    .locator('textarea[name="evidence"]')
    .fill("Tienda publicada en el dominio del cliente, catálogo de 120 productos migrado y capacitación impartida el 12 de octubre.");
  await page.getByRole("button", { name: "Presentar evidencia" }).click();
  await expect(page.getByText("Evidencia presentada. El cliente la revisará")).toBeVisible();
  await page.getByRole("button", { name: /Actuar como cliente/ }).click();
  const board = page.locator("section#entregas");
  await expect(board.getByRole("button", { name: "Autorizar el pago de este hito" })).toBeVisible();
  await settle(page);
  await board.screenshot({ path: `${OUT}/09-evidencia-por-revisar.png` });
  await board.getByRole("button", { name: "Autorizar el pago de este hito" }).click();
  await expect(board.getByText("Autorizado para pago")).toBeVisible();
  await settle(page);
  // Botón de PayPal activo: se captura, NO se pulsa.
  await expect(board.getByRole("button", { name: /Pagar .* con PayPal/ })).toBeEnabled();
  await board.screenshot({ path: `${OUT}/10-pagar-con-paypal.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/11-recorrido-y-siguiente-paso.png` });
  await page.screenshot({ path: `${OUT}/12-pacto-completo.png`, fullPage: true });

  // 6. Móvil (misma sesión, otro tamaño)
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const phone = await mobile.newPage();
  await phone.goto("/");
  await settle(phone);
  await phone.screenshot({ path: `${OUT}/13-movil-portada.png` });
  await phone.goto(`/pactos/${id}`);
  await settle(phone);
  await phone.screenshot({ path: `${OUT}/14-movil-pacto.png` });
  // Recorte de la página completa desde el inicio de la sección, a tamaño de pantalla: no
  // depende de cómo se desplace la página.
  async function phoneSection(section: ReturnType<Page["locator"]>, path: string) {
    await phone.evaluate(() => window.scrollTo(0, 0));
    const box = await section.boundingBox();
    if (!box) throw new Error(`sección no visible para ${path}`);
    await phone.screenshot({ path, fullPage: true, clip: { x: 0, y: Math.max(0, box.y - 16), width: 390, height: 844 } });
  }
  await phoneSection(
    phone.locator("section.card").filter({ has: phone.getByRole("heading", { name: "Análisis con IA" }) }),
    `${OUT}/15-movil-ia.png`,
  );
  await phoneSection(phone.locator("section#entregas"), `${OUT}/16-movil-paypal.png`);
  await mobile.close();
});
