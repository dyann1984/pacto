import { expect, test } from "@playwright/test";

// Pruebas reales contra Supabase (signInAnonymously de verdad, no simulado).
// No requieren ninguna credencial: el modo DEMO es, por diseño, autoservicio.

test("Explorar DEMO entra sin correo ni contraseña y llega a la app real", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/pactos$/, { timeout: 15000 });
  await expect(page.getByText("modo DEMO")).toBeVisible();
  await expect(page.getByText("Visitante DEMO")).toBeVisible();
});

test("un visitante DEMO no ve el acceso administrativo en el menú lateral", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\/pactos$/, { timeout: 15000 });
  await expect(page.getByRole("link", { name: /Panel de administración/ })).toHaveCount(0);
  await expect(page.locator(".sidebar")).toBeVisible();
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
  // "Pacto cerrado" aparece en el panel de siguiente paso y en la actividad: se acota al título.
  await expect(page.getByRole("heading", { name: "Pacto cerrado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar cierre" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Analizar versión/ })).toHaveCount(0);
});

// Agotar el cupo horario de sesiones anónimas es el fallo más probable que verá
// un juez, y el único que se arregla esperando. Si se presenta como una avería
// genérica, quien evalúa concluye que PACTO no funciona. Se fuerza el 429 en la
// respuesta de Supabase en vez de consumir el cupo real, que dejaría sin
// ejecutar al resto de la suite.
test("agotar el cupo de sesiones anónimas se explica como una espera, no como una avería", async ({ page }) => {
  await page.route("**/auth/v1/signup**", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "over_request_rate_limit", message: "Request rate limit reached" }),
    }),
  );

  await page.goto("/demo");

  // `.notice` acota al aviso de la pantalla: Next monta su propio role="alert"
  // para anunciar los cambios de ruta.
  const notice = page.locator(".notice[role='alert']");
  await expect(notice).toContainText("Demasiadas sesiones de prueba en la última hora");
  await expect(notice).toContainText("espera unos minutos");
  await expect(notice.getByRole("link", { name: /inicia sesión con una cuenta/ })).toBeVisible();
  // No debe confundirse con el mensaje de avería.
  await expect(page.getByText("Modo DEMO no disponible por ahora")).toHaveCount(0);
});

test("un fallo que no es el cupo se presenta como indisponibilidad, no como espera", async ({ page }) => {
  await page.route("**/auth/v1/signup**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "internal error" }),
    }),
  );

  await page.goto("/demo");

  await expect(page.locator(".notice[role='alert']")).toContainText("Modo DEMO no disponible por ahora");
  await expect(page.getByText("Demasiadas sesiones de prueba")).toHaveCount(0);
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
