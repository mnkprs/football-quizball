import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for StepOver frontend E2E tests.
 *
 * Scope: web-only (Capacitor-native iOS/Android smoke testing isn't covered
 * here — that's manual + TestFlight). Targets the Angular dev build at
 * http://localhost:4200 by default; CI can override via PLAYWRIGHT_BASE_URL.
 *
 * Boundary: tests in `e2e/` are isolated from the unit-test suite (Karma).
 * No collisions on file extensions because the Karma config doesn't pick up
 * files in e2e/.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-mobile',
      // Mimic an iPhone 14 viewport — this is a mobile-first app and most
      // visual edge cases (notch inset, touch targets) only manifest at
      // small widths.
      use: { ...devices['iPhone 14'] },
    },
  ],

  // Spin up the dev server automatically when running locally. CI runs
  // typically build separately and skip webServer.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://localhost:4200',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
