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

test("buyer A creates a pacto and invites seller B with a secure link; B joins; A submits", async () => {
  await signIn(pageA, demo.aEmail, demo.aPassword);
  pactoId = await createPacto(pageA, `E2E cierre ${runId}`);
  await expect(pageA.getByRole("heading", { name: "Invita a tu proveedor" })).toBeVisible();
  await pageA.getByRole("button", { name: "Generar enlace de invitación" }).click();
  const link = await pageA.getByLabel("Enlace de invitación").inputValue();
  expect(link).toMatch(/\/invitacion\/[0-9a-f]{64}$/);

  await signIn(pageB, demo.bEmail, demo.bPassword);
  await pageB.goto(new URL(link).pathname);
  await pageB.getByRole("button", { name: "Unirme como proveedor →" }).click();
  await pageB.waitForURL(new RegExp(`/pactos/${pactoId}`));
  await expect(pageB.getByText("Te uniste como proveedor")).toBeVisible();

  await pageA.goto(`/pactos/${pactoId}`);
  await expect(pageA.getByText(demo.bEmail)).toBeVisible();
  await pageA.getByRole("button", { name: "Enviar a revisión →" }).click();
  await expectBadge(pageA, /En revisión/);
});

test("seller B accepts; buyer A accepts; agreement becomes Aceptado", async () => {
  await pageB.goto(`/pactos/${pactoId}`);
  await pageB.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expect(pageB.getByText("Esperando la aceptación de la otra parte")).toBeVisible();
  await pageA.goto(`/pactos/${pactoId}`);
  await pageA.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await expectBadge(pageA, /Aceptado/);
  await pageB.reload();
  await expectBadge(pageB, /Aceptado/);
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
  await expect(pageA.getByText(/Proponer cambios|Editar el acuerdo/)).toHaveCount(0);
  await expect(pageA.getByRole("button", { name: "Confirmar cierre" })).toHaveCount(0);
});

test("AI analysis shows real findings or an explicit not-configured notice", async () => {
  await pageA.goto(`/pactos/${pactoId}`);
  if (process.env.PACTO_E2E_AI === "configured") {
    await pageA.getByRole("button", { name: /Analizar versión 1/ }).click();
    await expect(pageA.getByText("Análisis registrado")).toBeVisible();
    await expect(pageA.locator(".finding").first()).toBeVisible();
  } else {
    // Sin proveedor configurado no se ofrece un botón que fallaría ni resultados simulados.
    await expect(pageA.getByRole("button", { name: /Analizar versión/ })).toHaveCount(0);
    await expect(pageA.getByText(/todavía no está activado/)).toBeVisible();
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

test("DEMO users (non-admin) get a 404 on /admin, not the admin overview", async () => {
  const responseA = await pageA.goto("/admin");
  expect(responseA?.status()).toBe(404);
  await expect(pageA.getByText("Resumen operativo")).toHaveCount(0);

  const responseB = await pageB.goto("/admin");
  expect(responseB?.status()).toBe(404);
  await expect(pageB.getByText("Resumen operativo")).toHaveCount(0);
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
