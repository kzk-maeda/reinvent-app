import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath,
          args: ["--no-sandbox"],
        },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        launchOptions: {
          executablePath,
          args: ["--no-sandbox"],
        },
      },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    env: {
      APP_PASSWORD: "local-e2e-password",
      AI_PROVIDER: "simulator",
      PORT: "8787",
      HOST: "127.0.0.1",
      DATABASE_PATH: ".local/e2e.sqlite",
    },
    timeout: 20000,
  },
});
