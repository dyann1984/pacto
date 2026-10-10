import { expect, test } from "@playwright/test";

// Captura de pantallas para la entrega. Se ejecuta a mano, no forma parte de la
// suite habitual: crea un escenario DEMO nuevo igual que haría un juez.
//
// Queda fuera por defecto porque gasta dos sesiones anónimas del cupo horario
// que Supabase aplica por IP, y la suite completa ya se acerca a ese límite.
// Para generarlas:  PACTO_E2E_SHOTS=1 pnpm exec playwright test tests/e2e/shots.spec.ts
test.skip(!process.env.PACTO_E2E_SHOTS, "Capturas bajo demanda: PACTO_E2E_SHOTS=1");

test("capturas del Modo Juez", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "test-results/juez-1-portada.png" });
  await page.goto("/juez");
  await page.screenshot({ path: "test-results/juez-2-modo-juez.png" });

  await page.getByRole("button", { name: /Comenzar el recorrido/ }).click();
  await page.waitForURL(/\/pactos\/new/);
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  const id = page.url().match(/\/pactos\/([0-9a-f-]{36})$/)![1];
  await page.screenshot({ path: "test-results/juez-3-barra-y-pasos.png" });

  await page.getByRole("button", { name: "Generar enlace de invitación" }).click();
  await page.screenshot({ path: "test-results/juez-4-invitacion.png" });
  await page.getByRole("button", { name: /Abrir la invitación como proveedor/ }).click();
  await page.waitForURL(/\/invitacion\//);
  await page.getByRole("button", { name: "Unirme como proveedor →" }).click();
  await page.waitForURL(new RegExp(`/pactos/${id}`));

  await page.getByRole("button", { name: "Enviar a revisión →" }).click();
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();
  await page.getByRole("button", { name: /Actuar como cliente/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Aceptar versión 1/ }).click();

  await page.getByRole("button", { name: /Actuar como proveedor/ }).click();
  await page.waitForTimeout(1500);
  await page.locator('textarea[name="evidence"]').fill("Tienda publicada en el dominio del cliente y equipo capacitado el 12 de octubre.");
  await page.getByRole("button", { name: "Presentar evidencia" }).click();

  await page.getByRole("button", { name: /Actuar como cliente/ }).click();
  await page.waitForTimeout(1500);
  const board = page.locator("section.card").filter({ hasText: "Entregas y pagos" });
  await board.screenshot({ path: "test-results/juez-5-hitos-y-pagos.png" });
  await page.getByRole("button", { name: "Autorizar el pago de este hito" }).click();
  // Esperar al estado, no a un reloj: contra producción un segundo no alcanzaba
  // y la captura salía con el botón en "Procesando…", que no es lo que ilustra.
  await expect(board.getByText("Autorizado para pago")).toBeVisible();
  await board.screenshot({ path: "test-results/juez-6-autorizado-paypal.png" });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.screenshot({ path: "test-results/juez-7-movil.png" });
});
