import { defineConfig } from "@playwright/test";

const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) {
  throw new Error(
    "REPLIT_DEV_DOMAIN is required to run the E2E suite (it is the base URL of the running app).",
  );
}

const chromiumExecutable = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests",
  // The suite shares the development database with the running app, so keep it
  // serial to avoid cross-test interference. Each test still uses unique data.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./tests/global.setup.ts",
  globalTeardown: "./tests/global.teardown.ts",
  use: {
    baseURL: `https://${domain}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    launchOptions: chromiumExecutable
      ? { executablePath: chromiumExecutable }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
