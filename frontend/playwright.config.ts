import { defineConfig, devices } from "@playwright/test";

const releaseTests = /(?:release-hardening|trainer|backup|history)\.spec\.ts/;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
    {
      name: "firefox",
      testMatch: releaseTests,
      use: devices["Desktop Firefox"],
    },
    { name: "webkit", testMatch: releaseTests, use: devices["Desktop Safari"] },
    {
      name: "mobile-safari",
      testMatch: /release-hardening\.spec\.ts/,
      use: devices["iPhone 13"],
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 8765 --strictPort",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: false,
  },
});
