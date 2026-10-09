import { expect, type Page } from "@playwright/test";

// Credenciales DEMO solo desde el entorno local. Nunca se imprimen ni se registran.
export const demo = {
  aEmail: process.env.PACTO_DEMO_A_EMAIL ?? "",
  aPassword: process.env.PACTO_DEMO_A_PASSWORD ?? "",
  bEmail: process.env.PACTO_DEMO_B_EMAIL ?? "",
  bPassword: process.env.PACTO_DEMO_B_PASSWORD ?? "",
};

export const hasDemoCredentials = Boolean(
  demo.aEmail && demo.aPassword && demo.bEmail && demo.bPassword,
);

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar a mis Pactos" }).click();
  await page.waitForURL(/\/pactos$/);
}

// Visitante DEMO: sesión anónima real, sin correo ni contraseña.
export async function enterDemo(page: Page, next?: string) {
  await page.goto(next ? `/demo?next=${encodeURIComponent(next)}` : "/demo");
  await page.waitForURL(next ? new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : /\/pactos$/);
}

export function pactoIdFrom(url: string) {
  const match = url.match(/\/pactos\/([0-9a-f-]{36})$/);
  if (!match) throw new Error("La URL no contiene un identificador de Pacto");
  return match[1];
}

export async function createPacto(page: Page, title: string) {
  await page.goto("/pactos/new");
  await page.locator('input[name="title"]').fill(title);
  await page
    .locator('textarea[name="scope"]')
    .fill("Impermeabilizar la cubierta del edificio según el plan acordado.");
  await page.locator('input[name="amount"]').fill("1000");
  await page.getByRole("button", { name: "Crear acuerdo →" }).click();
  await page.waitForURL(/\/pactos\/[0-9a-f-]{36}$/);
  return pactoIdFrom(page.url());
}

export async function expectBadge(page: Page, text: RegExp) {
  await expect(page.locator(".badge").filter({ hasText: text }).first()).toBeVisible();
}
