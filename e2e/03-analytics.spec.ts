import { expect, test, type Page } from '@playwright/test';
import { seedPost } from './helpers';

// Runs after 02-flow, which leaves the database without episodes: the numbers below are exact.
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const VIEWS = 'mdef_views';
const LIKES = 'mdef_likes';

const ids: Record<string, { episodeId: string; distUrl: string }> = {};

const rowOf = (page: Page, title: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: title, exact: true }) });
const firstColumn = (page: Page) => page.locator('#table-heading ~ div table tbody tr th').allInnerTexts();

test('seed posts: measured zero, unknown value, out-of-window, undated, and two platforms', async ({ page }) => {
  // YouTube, 24h readings (published 10-0X 10:00, captured the next day 10:00)
  ids.Alfa = await seedPost(page, { title: 'Alfa', platform: 'youtube', publishedAt: '2026-10-01T10:00', tags: 'horor', snapshots: [{ at: '2026-10-02T10:00', values: { [VIEWS]: '900' } }, { at: '2026-10-04T10:00', values: { [VIEWS]: '1800' } }] });
  ids.Bravo = await seedPost(page, { title: 'Bravo', platform: 'youtube', publishedAt: '2026-10-02T10:00', tags: 'horor', snapshots: [{ at: '2026-10-03T10:00', values: { [VIEWS]: '0' } }, { at: '2026-10-04T10:00', values: { [VIEWS]: '50' } }] });
  ids.Charlie = await seedPost(page, { title: 'Charlie', platform: 'youtube', publishedAt: '2026-10-03T10:00', tags: 'lucu', snapshots: [{ at: '2026-10-04T10:00', values: { [VIEWS]: '450' } }] });
  ids.Delta = await seedPost(page, { title: 'Delta', platform: 'youtube', publishedAt: '2026-10-04T10:00', snapshots: [{ at: '2026-10-05T10:00', values: { [LIKES]: '3' } }, { at: '2026-10-06T10:00', values: { [VIEWS]: '100' } }] });
  ids.Echo = await seedPost(page, { title: 'Echo', platform: 'youtube', publishedAt: '2026-10-05T10:00', snapshots: [{ at: '2026-10-09T10:00', values: { [VIEWS]: '5000' } }] }); // 96h only
  ids.Golf = await seedPost(page, { title: 'Golf', platform: 'youtube', snapshots: [{ at: '2026-10-02T10:00', values: { [VIEWS]: '10' }, confirm: true }] }); // undated
  ids.Foxtrot = await seedPost(page, { title: 'Foxtrot', platform: 'tiktok', publishedAt: '2026-10-01T10:00', snapshots: [{ at: '2026-10-02T10:00', values: { [VIEWS]: '12000' } }] });
});

test('basis, data quality counts, and per-platform summaries (never combined)', async ({ page }) => {
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { level: 1, name: 'Analitik' })).toBeVisible();
  const quality = page.locator('#basis-heading').locator('xpath=ancestor::section');
  await expect(quality).toContainText('Views (views) pada usia 24 jam ± 6 jam.');
  await expect(quality.getByText('Distribusi dalam filter').locator('xpath=following-sibling::dd')).toHaveText('7');
  await expect(quality.getByText('Sebanding pada usia target').locator('xpath=following-sibling::dd')).toHaveText('4');
  await expect(quality).toContainText('1 × Nilai metrik tidak diketahui');
  await expect(quality).toContainText('1 × Tidak ada snapshot di jendela usia');
  await expect(quality).toContainText('1 × Usia post tidak diketahui');

  const yt = page.locator('#p-youtube').locator('xpath=ancestor::section');
  await expect(yt.getByText('Sebanding', { exact: true }).locator('xpath=following-sibling::dd')).toContainText('3 dari 6');
  await expect(yt.getByText(/^Median/).locator('xpath=following-sibling::dd')).toHaveText('450');
  await expect(yt.getByText(/^Terendah/).locator('xpath=following-sibling::dd')).toHaveText('0'); // a measured zero is a real minimum
  await expect(yt.getByText(/^Tertinggi/).locator('xpath=following-sibling::dd')).toHaveText('900');

  const tt = page.locator('#p-tiktok').locator('xpath=ancestor::section');
  await expect(tt.getByText(/^Median/).locator('xpath=following-sibling::dd')).toHaveText('12.000');

  // No cross-platform aggregate exists anywhere on the page.
  const body = await page.locator('main').innerText();
  expect(body).not.toContain('13.350');
  expect(body).not.toContain('12.900');
});

test('every non-comparable post says why (and zero is shown as 0)', async ({ page }) => {
  await page.goto('/analytics');
  await expect(rowOf(page, 'Delta')).toContainText('Nilai metrik tidak diketahui');
  await expect(rowOf(page, 'Echo')).toContainText('Tidak ada snapshot di jendela usia');
  await expect(rowOf(page, 'Echo')).toContainText('snapshot terdekat berusia 4 hari');
  await expect(rowOf(page, 'Golf')).toContainText('Usia post tidak diketahui');
  const bravo = rowOf(page, 'Bravo');
  await expect(bravo.getByRole('cell').nth(2)).toHaveText('0'); // nilai
  await expect(bravo).toContainText('Sebanding');
  await expect(rowOf(page, 'Alfa')).toContainText('tepat target');
  await expect(rowOf(page, 'Alfa')).toContainText('manual'); // provenance
});

test('sorting puts unknown last in both directions and exposes aria-sort', async ({ page }) => {
  await page.goto('/analytics');
  await page.getByRole('columnheader', { name: /Views/ }).getByRole('link').click();
  await expect(page).toHaveURL(/sort=value$/); // desc is the default direction, so it is omitted from the URL
  await expect(page.getByRole('columnheader', { name: /Views/ })).toHaveAttribute('aria-sort', 'descending');
  expect(await firstColumn(page)).toEqual(['Foxtrot', 'Alfa', 'Charlie', 'Bravo', 'Delta', 'Echo', 'Golf']);

  await page.getByRole('columnheader', { name: /Views/ }).getByRole('link').click();
  await expect(page).toHaveURL(/sort=value&dir=asc/);
  expect(await firstColumn(page)).toEqual(['Bravo', 'Charlie', 'Alfa', 'Foxtrot', 'Delta', 'Echo', 'Golf']);
});

test('rankings need a minimum sample and carry warnings', async ({ page }) => {
  await page.goto('/analytics');
  const yt = page.locator('#p-youtube').locator('xpath=ancestor::section');
  await expect(yt.getByRole('heading', { name: 'Teratas — YouTube' })).toBeVisible();
  await expect(yt.getByText('1. Alfa')).toBeVisible();
  await expect(yt.getByText(/Sampel kecil \(n=3\)/)).toBeVisible();
  await expect(yt.getByRole('heading', { name: /Terbawah/ })).toHaveCount(0); // needs n ≥ 6
  await expect(yt.getByText(/bukan penjelasan sebab/)).toBeVisible();

  const tt = page.locator('#p-tiktok').locator('xpath=ancestor::section');
  await expect(tt.getByText(/Sampel terlalu kecil untuk peringkat \(n=1 < 3\)/)).toBeVisible();
  await expect(tt.getByRole('heading', { name: /Teratas/ })).toHaveCount(0);
});

test('filters: platform, tag, date range (in the app time zone) and invalid values', async ({ page }) => {
  await page.goto('/analytics?platform=tiktok');
  expect(await firstColumn(page)).toEqual(['Foxtrot']);

  await page.goto('/analytics?tag=horor');
  expect((await firstColumn(page)).sort()).toEqual(['Alfa', 'Bravo']);

  await page.goto('/analytics?from=2026-10-02&to=2026-10-03');
  expect((await firstColumn(page)).sort()).toEqual(['Bravo', 'Charlie']);
  await expect(page.getByText('1 distribusi tanpa waktu terbit tidak ikut karena filter tanggal.')).toBeVisible();

  await page.goto('/analytics?platform=instagram&from=2026-02-30&sort=password');
  await expect(page.getByRole('alert').filter({ hasText: 'Filter diabaikan' }).or(page.getByText('Filter diabaikan'))).toBeVisible();
  await expect(page.getByText('Nilai tidak valid untuk: platform, tanggal mulai, urutan.')).toBeVisible();
  expect((await firstColumn(page)).length).toBe(7); // fell back to no filter

  await page.goto('/analytics?from=2026-10-20&to=2026-10-25');
  await expect(page.getByRole('heading', { name: 'Tidak ada distribusi yang cocok dengan filter' })).toBeVisible();
});

test('changing the age window changes the answer instead of reusing far-away snapshots', async ({ page }) => {
  await page.goto('/analytics?window=168');
  const quality = page.locator('#basis-heading').locator('xpath=ancestor::section');
  await expect(quality).toContainText('Views (views) pada usia 168 jam ± 24 jam.');
  await expect(quality.getByText('Sebanding pada usia target').locator('xpath=following-sibling::dd')).toHaveText('0');
  await expect(page.getByText('Belum ada post sebanding di platform ini, jadi tidak ada ringkasan (bukan 0).').first()).toBeVisible();
});

test('trend chart: gaps for unknowns, marker semantics, tooltip on hover and focus, and a table twin', async ({ page }) => {
  await page.goto('/analytics');
  const fig = page.getByRole('figure').filter({ hasText: 'Views pada usia 24 jam — YouTube' });
  await expect(fig).toBeVisible();
  await expect(fig.locator('.chart-point')).toHaveCount(5); // Alfa..Echo; undated Golf is not plotted
  await expect(fig.locator('.chart-point[aria-label*="tidak diketahui"], .chart-point[aria-label*="Tidak ada snapshot"]')).toHaveCount(2); // Delta, Echo

  await fig.locator('.chart-point').first().hover();
  await expect(page.getByRole('tooltip')).toContainText('Alfa');
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  await fig.locator('.chart-point').nth(1).focus();
  await expect(page.getByRole('tooltip')).toContainText('Bravo');
  await expect(page.getByRole('tooltip')).toContainText('0');

  await fig.getByText('Tabel data grafik').click();
  await expect(fig.getByRole('row')).toHaveCount(6); // header + 5 posts
  await expect(fig.getByRole('row').filter({ hasText: 'Delta' })).toContainText('Nilai metrik tidak diketahui');
});

test('episode performance: values at each window, trend by age, and changes with baseline rules', async ({ page }) => {
  await page.goto(`/episodes/${ids.Alfa!.episodeId}/performance`);
  await expect(page.getByRole('heading', { level: 1, name: 'Performa — Alfa' })).toBeVisible();
  const windows = page.getByRole('table', { name: /pada tiap jendela usia/ });
  await expect(windows.getByRole('row').filter({ hasText: '24 jam ± 6 jam' })).toContainText('900');
  await expect(windows.getByRole('row').filter({ hasText: '168 jam ± 24 jam' })).toContainText('Tidak ada snapshot di jendela usia');
  await expect(page.getByRole('table', { name: /Perubahan Views/ }).getByRole('row').nth(1)).toContainText('+900 (+100%)');

  await page.goto(`/episodes/${ids.Bravo!.episodeId}/performance`);
  const bravoChanges = page.getByRole('table', { name: /Perubahan Views/ });
  await expect(bravoChanges).toContainText('+50');
  await expect(bravoChanges).toContainText('Relatif tidak tersedia: Baseline 0');

  await page.goto(`/episodes/${ids.Delta!.episodeId}/performance`);
  await expect(page.getByRole('table', { name: /Perubahan Views/ })).toContainText('Salah satu nilai tidak diketahui');

  // A different metric: Likes (recorded once, for Delta).
  await page.locator('#metric').selectOption({ label: 'Likes (likes)' });
  await page.getByRole('button', { name: 'Tampilkan' }).click();
  await expect(page.getByRole('table', { name: /pada tiap jendela usia/ }).getByRole('row').filter({ hasText: '24 jam ± 6 jam' })).toContainText('3');
});

test('overview KPIs: per-platform, with reasons and baseline rules', async ({ page }) => {
  await page.goto('/');
  const kpi = page.locator('#kpi-heading').locator('xpath=ancestor::section');
  await expect(kpi).toContainText('Tiap platform dibaca terpisah; tidak ada total lintas platform.');
  const tiles = kpi.getByRole('listitem');
  await expect(tiles).toHaveCount(2);

  const yt = tiles.filter({ hasText: 'YouTube' });
  await expect(yt).toContainText('Echo'); // latest published
  await expect(yt).toContainText('Tidak ada snapshot di jendela usia'); // shown instead of a number
  await expect(yt).toContainText('Salah satu nilai tidak diketahui'); // delta unavailable: latest unknown
  await expect(yt).toContainText('3 dari 6 distribusi sebanding');

  const tt = tiles.filter({ hasText: 'TikTok' });
  await expect(tt).toContainText('12.000');
  await expect(tt).toContainText('Perubahan tidak tersedia — belum ada post sebelumnya');
  await expect(page.getByRole('link', { name: /^02\s*Understand/ })).toHaveAttribute('href', '/analytics');
});

test('analytics and performance pages fit 360px and name their controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const url of ['/analytics', `/episodes/${ids.Alfa!.episodeId}/performance`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${url} overflows`).toBe(true);
  }
  await page.goto('/analytics');
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('main input:not([type=hidden]), main select')].filter((el) => !(el as HTMLInputElement).labels?.length).length,
  );
  expect(unnamed).toBe(0);
});
