// Optional fallback when the agent-browser executable is blocked by Windows.
// Exercises the actual production app; never bypasses Supabase authentication.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const root = "http://127.0.0.1:3000";
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        errors.push(`${message.text()} ${message.location().url}`);
    });
    const response = await page.goto(root, { waitUntil: "networkidle" });
    if (response.status() !== 200) throw new Error("LANDING_HTTP_FAILURE");
    await page
      .getByRole("heading", {
        name: "Convierte tus acuerdos en resultados reales.",
      })
      .waitFor();
    await page.screenshot({
      path: `docs/screenshots/landing-${name}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error(`${name}: HORIZONTAL_OVERFLOW`);
    await page.getByRole("link", { name: "Iniciar sesión" }).click();
    await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
    await page.screenshot({
      path: `docs/screenshots/sign-in-${name}.png`,
      fullPage: true,
    });
    await page.goto(`${root}/pactos/11111111-1111-4111-8111-111111111111`, {
      waitUntil: "networkidle",
    });
    if (!page.url().includes("/sign-in"))
      throw new Error("PROTECTED_ROUTE_EXPOSED");
    if (errors.length) throw new Error(JSON.stringify(errors));
    results.push({
      viewport: name,
      landing: 200,
      navigation: "PASS",
      protectedRoute: "REDIRECT_SIGN_IN",
      horizontalOverflow: false,
      consoleErrors: errors,
    });
    await page.close();
  }
  const api = await fetch(
    `${root}/api/pactos/11111111-1111-4111-8111-111111111111`,
  );
  if (![401, 503].includes(api.status))
    throw new Error("API_FAIL_CLOSED_ERROR");
  results.push({ unauthenticatedApiStatus: api.status });
  await writeFile(
    "docs/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
