import { expect, test } from "@playwright/test";

// Pruebas reales contra Supabase (signInAnonymously de verdad, no simulado).
// No requieren ninguna credencial: el modo DEMO es, por diseño, autoservicio.

test("Explorar DEMO entra sin correo ni contraseña y llega a la app real", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/pactos$/, { timeout: 15000 });
  await expect(page.getByText("modo DEMO")).toBeVisible();
  await expect(page.getByText("Visitante DEMO")).toBeVisible();
});

test("un visitante DEMO no puede entrar a /admin", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/pactos$/, { timeout: 15000 });
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});

test("el Pacto de ejemplo público es visible, de solo lectura, sin acciones disponibles", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/pactos$/, { timeout: 15000 });
  await page.goto(`/pactos/${process.env.PACTO_DEMO_EXAMPLE_ID}`);
  // "Pacto cerrado" aparece dos veces (aviso de estado y evento de auditoría): se acota.
  await expect(page.getByText("Pacto cerrado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar cierre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Analizar versión/ })).toHaveCount(0);
});

test("dos visitantes DEMO distintos están aislados entre sí", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/demo");
  await pageA.waitForURL(/\/pactos$/, { timeout: 15000 });
  await pageA.goto("/pactos/new");
  await pageA.locator('input[name="title"]').fill(`DEMO privado ${Date.now()}`);
  await pageA
    .locator('textarea[name="scope"]')
    .fill("Alcance privado de un visitante DEMO, no debe ser visible para otro visitante.");
  await pageA.locator('input[name="amount"]').fill("100");
  await pageA.getByRole("button", { name: "Crear acuerdo →" }).click();
  await pageA.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const privatePactoUrl = pageA.url();
  const privateId = privatePactoUrl.match(/\/pactos\/([0-9a-f-]{36})$/)?.[1];
  expect(privateId).toBeTruthy();

  await pageB.goto("/demo");
  await pageB.waitForURL(/\/pactos$/, { timeout: 15000 });
  const response = await pageB.goto(`/pactos/${privateId}`);
  expect(response?.status()).toBe(404);

  await contextA.close();
  await contextB.close();
});
