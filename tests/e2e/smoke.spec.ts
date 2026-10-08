import { expect, test } from "@playwright/test";

// Pruebas que no requieren credenciales: siempre se ejecutan.

test("protected routes redirect to sign-in without a session", async ({ page }) => {
  await page.goto("/pactos");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/pactos/new");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-in form uses a password field and a POST form action", async ({ page }) => {
  // Solo se verifica la estructura: no se envía ninguna credencial.
  await page.goto("/sign-in");
  await expect(page.locator('input[name="email"]')).toHaveAttribute("type", "email");
  await expect(page.locator('input[name="password"]')).toHaveAttribute("type", "password");
  await expect(page.locator("form").first()).toHaveAttribute("method", /post/i);
});

test("API rejects anonymous reads with 401", async ({ request }) => {
  const response = await request.get("/api/pactos/00000000-0000-4000-8000-000000000000");
  expect(response.status()).toBe(401);
});

test("rendered HTML does not expose private server secrets", async ({ request }) => {
  const html = await (await request.get("/sign-in")).text();
  for (const forbidden of ["service_role", "ANTHROPIC_API_KEY", "sk-ant-", "sb_secret_"]) {
    expect(html).not.toContain(forbidden);
  }
});
