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

test("password visibility toggle shows and hides without losing the typed value", async ({ page }) => {
  await page.goto("/sign-in");
  const input = page.locator('input[name="password"]');
  const toggle = page.getByRole("button", { name: "Mostrar contraseña" });
  await input.fill("una-contraseña-de-prueba");
  await expect(input).toHaveAttribute("type", "password");
  await toggle.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue("una-contraseña-de-prueba");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue("una-contraseña-de-prueba");
});

test("password toggle is keyboard-operable and announces its state", async ({ page }) => {
  await page.goto("/sign-in");
  const toggle = page.getByRole("button", { name: "Mostrar contraseña" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("sign-up has independent toggles for password and confirm-password fields", async ({ page }) => {
  await page.goto("/sign-up");
  const password = page.locator('input[name="password"]');
  const confirm = page.locator('input[name="passwordConfirm"]');
  await password.fill("abc12345");
  await confirm.fill("xyz98765");
  await page.getByRole("button", { name: "Mostrar contraseña" }).first().click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirm).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("abc12345");
  await expect(confirm).toHaveValue("xyz98765");
});

test("sign-in with a non-existent account shows a real, non-enumerating error from Supabase", async ({
  page,
}) => {
  // Prueba real contra Supabase (no simulada): un correo que no existe debe
  // comportarse igual que una contraseña incorrecta, sin distinguir el caso.
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(`no-existe-${Date.now()}@example.com`);
  await page.locator('input[name="password"]').fill("contraseña-cualquiera");
  await page.getByRole("button", { name: "Entrar a mis Pactos" }).click();
  await expect(page).toHaveURL(/\/sign-in\?status=invalid$/);
  // role=alert también lo usa el anunciador de rutas de Next.js; se acota a la propia notificación.
  await expect(page.locator(".notice[role=alert]")).toContainText("No se pudo iniciar sesión");
});

test("Google button reflects the real, currently-disabled provider state", async ({ page }) => {
  // Si Google se habilita en Supabase, este test debe actualizarse: hoy refleja
  // el estado real consultado en vivo, no un valor fijo en el código.
  await page.goto("/sign-in");
  const googleButton = page.getByRole("button", { name: "Continuar con Google" });
  await expect(googleButton).toBeDisabled();
  await expect(page.getByText("Disponible próximamente")).toBeVisible();
});

test("/admin redirects anonymous visitors to sign-in", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("password reset without a valid code shows an explicit invalid-link notice", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText("Enlace inválido o expirado")).toBeVisible();
});

test("sign-up creates a real Supabase account and asks for email confirmation", async ({ page }) => {
  // Prueba real: crea una cuenta nueva en el proyecto Supabase configurado (no simulada).
  // El correo queda registrado para verificación posterior (rol, confirmación) por SQL.
  const email = `e2e-signup-${Date.now()}@test.pacto.dev`;
  await page.goto("/sign-up");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("contraseña-e2e-1");
  await page.locator('input[name="passwordConfirm"]').fill("contraseña-e2e-1");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForURL(/\/(sign-in|sign-up)\?status=/);

  // El correo integrado de Supabase está limitado por hora. Sin cupo no se puede
  // comprobar el registro real, pero eso no es un fallo del producto: se
  // distingue en vez de teñir la suite de rojo. Que ese caso se presente bien es
  // lo que comprueba la prueba siguiente, que no depende del entorno.
  if (/status=email-rate-limit/.test(page.url()))
    test.skip(true, "Cupo horario de correo de Supabase agotado: el registro real no se puede verificar ahora.");

  await expect(page).toHaveURL(/\/sign-in\?status=check-email$/);
  await expect(page.locator(".notice-info")).toContainText("confirma tu cuenta");
  console.log(`E2E_SIGNUP_EMAIL=${email}`);
});

// El servicio de correo integrado de Supabase está limitado por hora, así que
// quedarse sin cupo es un caso cotidiano, no excepcional. Si se presenta como
// "no se pudo completar el registro", quien evalúa PACTO cree que está roto.
// Se fuerza la respuesta en vez de agotar el cupo real, que dejaría sin probar
// el registro de verdad.
test("agotar el cupo de correo se explica y ofrece la DEMO, que no lo necesita", async ({ page }) => {
  await page.route("**/auth/v1/signup**", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }),
    }),
  );

  await page.goto("/sign-up");
  await page.locator('input[name="email"]').fill(`e2e-cupo-${Date.now()}@test.pacto.dev`);
  await page.locator('input[name="password"]').fill("contraseña-e2e-1");
  await page.locator('input[name="passwordConfirm"]').fill("contraseña-e2e-1");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();

  await expect(page).toHaveURL(/\/sign-up\?status=email-rate-limit$/);
  const notice = page.locator(".notice").filter({ hasText: "límite de correos" });
  await expect(notice).toContainText("Tu cuenta no se ha creado");
  await expect(notice).toContainText("Explorar DEMO");
  // No debe presentarse como la avería genérica.
  await expect(page.getByText("No se pudo completar el registro")).toHaveCount(0);
});

test("sign-up rejects mismatched passwords before contacting Supabase", async ({ page }) => {
  await page.goto("/sign-up");
  await page.locator('input[name="email"]').fill(`e2e-mismatch-${Date.now()}@test.pacto.dev`);
  await page.locator('input[name="password"]').fill("contraseña-uno");
  await page.locator('input[name="passwordConfirm"]').fill("otra-contraseña");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page).toHaveURL(/\/sign-up\?status=mismatch$/);
  await expect(page.locator(".notice[role=alert]")).toContainText("no coinciden");
});
