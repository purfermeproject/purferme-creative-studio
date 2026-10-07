import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Smoke tests run against a separate database with mock AI, so they cost nothing
// and never touch real data. Override E2E_DATABASE_URL to point elsewhere.
const env = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/studio_test",
  ANTHROPIC_MOCK: "true",
  AUTH_DEV_LOGIN: "true",
  AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
  AUTH_TRUST_HOST: "true",
  ALLOWED_EMAILS: "e2e@example.com",
};
Object.assign(process.env, env);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
