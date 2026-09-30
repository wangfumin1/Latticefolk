import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './e2e',
  // The playable scenarios share one server-side SQLite world. Separate files must not
  // reset or write that world concurrently; isolate storage before increasing workers.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    }
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      JEV_PROVIDER: 'fallback',
      // The tests reset their world: never point them at a player's regular save.
      WORLD_DB_PATH: fileURLToPath(new URL('./data/latticefolk.e2e.sqlite',import.meta.url))
    }
  }
});
