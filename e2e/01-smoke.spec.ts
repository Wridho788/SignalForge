import { expect, test } from '@playwright/test';

// Runs first (alphabetical): the database is fresh here, so these assert the true empty state.
test.describe.configure({ mode: 'serial' });

test('home page shows the SignalForge identity and the empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SignalForge — Content Intelligence');
  await expect(page.getByRole('heading', { name: 'Belum ada data' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buat episode pertama' })).toBeVisible();
  // Cycle stages are labelled honestly: all four stages are available.
  await expect(page.getByText('Tersedia', { exact: true })).toHaveCount(4);
  await expect(page.getByText('Belum tersedia', { exact: true })).toHaveCount(0);
});

test('episodes list is empty on a fresh database', async ({ page }) => {
  await page.goto('/episodes');
  await expect(page.getByRole('heading', { name: 'Belum ada episode' })).toBeVisible();
});

test('health endpoint reports the database and schema version', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', app: 'signalforge', database: 'ok', schemaVersion: 5 });
});

test('unknown ids render the not-found page, not a crash', async ({ page }) => {
  await page.goto('/episodes/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible();
});
