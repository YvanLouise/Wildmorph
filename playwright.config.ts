import { defineConfig, devices } from '@playwright/test';

const runSoak = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env?.TUYE_SOAK === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  fullyParallel: false,
  // Fullscreen is window-scoped; serial projects prevent mobile fullscreen from
  // stealing focus from desktop scene tests running in another Chrome window.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4397',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      testIgnore: runSoak ? /mobile\.spec\.ts/ : [/mobile\.spec\.ts/, /soak\.spec\.ts/],
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7 landscape'], channel: 'chrome' },
    },
  ],
});
