import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 1,
  workers: 4,
  reporter: [
    ["html", { open: "never", outputFolder: "e2e-report" }],
    ["json", { outputFile: "e2e-results/results.json" }],
    ["./e2e/health-reporter.ts"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    storageState: "e2e/playwright/.auth/user.json",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "es-ES",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testIgnore: /global-setup\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
