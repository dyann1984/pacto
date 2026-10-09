import { defineConfig, devices } from "@playwright/test";

// Carga .env.local si existe (Node 22). Las variables DEMO nunca se imprimen.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local solo se ejecutan las pruebas que no requieren credenciales.
}

const PORT = Number(process.env.PACTO_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results/e2e",
  use: {
    baseURL: process.env.PACTO_E2E_BASE_URL || BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        // En Windows se usa Microsoft Edge ya instalado; en CI, el Chromium de Playwright.
        channel: process.platform === "win32" ? "msedge" : undefined,
      },
    },
  ],
  // Requiere `pnpm build` previo. Reutiliza un servidor ya levantado si existe.
  // Con PACTO_E2E_BASE_URL (Preview) no se levanta servidor local.
  webServer: process.env.PACTO_E2E_BASE_URL ? undefined : {
    command: `corepack pnpm@11.28.5 start --port ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
