import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  createPacto,
  demo,
  expectBadge,
  hasDemoCredentials,
  pactoIdFrom,
  signIn,
} from "./helpers";

// Flujos críticos con dos usuarios DEMO reales. Requiere credenciales en .env.local
// (PACTO_DEMO_A_*, PACTO_DEMO_B_*, PACTO_DEMO_B_ID). Sin ellas, la suite se omite.
// PACTO_E2E_AI indica el resultado esperado de la IA: "configured" o "not-configured".
test.skip(!hasDemoCredentials, "Faltan credenciales DEMO en el entorno: suite omitida.");

const runId = Date.now().toString(36);
let contextA: BrowserContext;
let contextB: BrowserContext;
let pageA: Page;
let pageB: Page;
let pactoId: string;
let cancelId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  contextA = await browser.newContext();
  contextB = await browser.newContext();
  pageA = await contextA.newPage();
  pageB = await contextB.newPage();
});

test.afterAll(async () => {
  await contextA?.close();
  await contextB?.close();
});

test("buyer A signs in, creates a pacto, adds seller B and submits for review", async () => {
  await signIn(pageA, demo.aEmail, demo.aPassword);
  pactoId = await createPacto(pageA, `E2E cierre ${runId}`);
  await pageA.locator('input[name="sellerId"]').fill(demo.bId);
  await pageA.getByRole("button", { name: "Añadir proveedor" }).click();
  await expect(pageA.getByText("Proveedor")).toBeVisible();
  await pageA.getByRole("button", { name: "Enviar a revisión →" }).click();
  await expectBadge(pageA, /REVIEW/);
});

test("seller B signs in and accepts; buyer A accepts; agreement becomes ACCEPTED", async () => {
  await signIn(pageB, demo.bEmail, demo.bPassword);
  await pageB.goto(`/pactos/${pactoId}`);
  await pageB.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await pageA.goto(`/pactos/${pactoId}`);
  await pageA.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expectBadge(pageA, /ACCEPTED/);
  await pageB.reload();
  await expectBadge(pageB, /ACCEPTED/);
});

test("both parties confirm closure and the pacto ends CLOSED after a reload", async () => {
  await pageA.goto(`/pactos/${pactoId}`);
  await pageA.locator('textarea[name="note"]').fill("Entrega verificada en E2E");
  await pageA.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(pageA.getByText("Tu confirmación de cierre quedó registrada")).toBeVisible();

  await pageB.goto(`/pactos/${pactoId}`);
  await pageB.getByRole("button", { name: "Confirmar cierre" }).click();
  await expect(pageB.getByText("Ambas partes confirmaron")).toBeVisible();

  await pageB.reload();
  await expectBadge(pageB, /Cerrado/);
  await expect(pageB.getByText("Pacto cerrado")).toBeVisible();
});

test("a closed pacto rejects further edits in the UI", async () => {
  await pageA.goto(`/pactos/${pactoId}`);
  await expect(pageA.getByRole("button", { name: /Proponer nueva versión|Editar borrador/ })).toHaveCount(0);
  await expect(pageA.getByRole("button", { name: "Confirmar cierre" })).toHaveCount(0);
});

test("AI analysis shows real findings or an explicit not-configured notice", async () => {
  await pageA.goto(`/pactos/${pactoId}`);
  await pageA.getByRole("button", { name: /Analizar versión 1/ }).click();
  if (process.env.PACTO_E2E_AI === "configured") {
    await expect(pageA.getByText("Análisis registrado")).toBeVisible();
    await expect(pageA.locator(".finding").first()).toBeVisible();
    await expect(pageA.getByText(/Modelo claude-/)).toBeVisible();
  } else {
    await expect(pageA.getByText(/no está configurado/)).toBeVisible();
    await expect(pageA.getByText("Aún no hay análisis registrado")).toBeVisible();
  }
});

test("buyer A cancels a second pacto with a reason; the cancellation is audited", async () => {
  cancelId = await createPacto(pageA, `E2E cancelación ${runId}`);
  await pageA.locator("details.danger-zone summary").click();
  await pageA.locator('textarea[name="reason"]').fill("Prueba de cancelación E2E controlada");
  await pageA.getByRole("button", { name: "Cancelar Pacto" }).click();
  await expect(pageA.getByText("El Pacto fue cancelado")).toBeVisible();
  await expectBadge(pageA, /Cancelado/);
  await expect(pageA.getByText("Pacto cancelado")).toBeVisible();
});

test("a user outside the pacto cannot open it (404, no leaked data)", async ({ browser }) => {
  const outsider = await browser.newContext();
  const page = await outsider.newPage();
  await signIn(page, demo.bEmail, demo.bPassword);
  const response = await page.goto(`/pactos/${cancelId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(`E2E cancelación ${runId}`)).toHaveCount(0);
  await outsider.close();
});

test("pacto state survives a full reload from a new session", async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await signIn(page, demo.aEmail, demo.aPassword);
  await page.goto(`/pactos/${pactoId}`);
  await expectBadge(page, /Cerrado/);
  expect(pactoIdFrom(page.url())).toBe(pactoId);
  await fresh.close();
});
