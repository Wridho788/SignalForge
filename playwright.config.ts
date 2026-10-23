import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  // One shared database per run: tests are ordered and build on each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    // Production build + server: realistic and not subject to on-demand dev compilation.
    // Builds into .next, so stop `pnpm dev` first. Port 3100 never clashes with dev (3000).
    command: 'pnpm build && node scripts/e2e-server.mjs --prod',
    // A static page, so the readiness probe does not open the database.
    url: `${baseURL}/settings/metrics/new`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
