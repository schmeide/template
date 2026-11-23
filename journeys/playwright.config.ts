// The app's journeys: one Playwright test per acceptance check, written by Schmeide's tester.
// `make journeys BASE_URL=...` runs them against a running copy of the app. JOURNEYS_REPORT, when
// set, is where a JSON report of the run is written as well.
import { defineConfig } from "@playwright/test";

const report = process.env.JOURNEYS_REPORT;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // Outside journeys/, which holds only what Schmeide writes.
  outputDir: "../test-results/journeys",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 2,
  reporter: report ? [["list"], ["json", { outputFile: report }]] : "list",
  use: {
    baseURL: process.env.BASE_URL,
    browserName: "chromium",
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    serviceWorkers: "block",
    actionTimeout: 5_000,
    navigationTimeout: 20_000,
  },
});
