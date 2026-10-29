import { defineConfig, devices } from "@playwright/test";

// E2E runs its own worker + frontend on separate ports so it never collides with `pnpm dev`.
const WORKER_PORT = 8797;
const WEB_PORT = 5183;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
  ],
  webServer: [
    {
      command: `pnpm --filter worker exec wrangler dev --port ${WORKER_PORT} --persist-to .wrangler/e2e-state --var DISABLE_CREATE_LIMIT:true`,
      url: `http://localhost:${WORKER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { WORKER_URL: `http://localhost:${WORKER_PORT}`, PORT: String(WEB_PORT) },
    },
  ],
});
