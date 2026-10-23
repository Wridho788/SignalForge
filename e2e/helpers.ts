import { expect, type Page } from '@playwright/test';

export async function createEpisode(page: Page, title: string, extra: { code?: string; tags?: string } = {}) {
  await page.goto('/episodes/new');
  await page.locator('#title').fill(title);
  if (extra.code) await page.locator('#episodeCode').fill(extra.code);
  if (extra.tags) await page.locator('#tags').fill(extra.tags);
  await page.getByRole('button', { name: 'Buat episode' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const match = /\/episodes\/([^/?]+)/.exec(page.url());
  return match![1]!;
}

export async function addDistribution(
  page: Page,
  episodeId: string,
  opts: { platform: 'facebook' | 'youtube' | 'tiktok'; publishedAt?: string; variant?: string; status?: string },
) {
  await page.goto(`/episodes/${episodeId}/distributions/new`);
  await page.locator('#platformId').selectOption(opts.platform);
  if (opts.status) await page.locator('#status').selectOption(opts.status);
  if (opts.publishedAt) await page.locator('#publishedAtLocal').fill(opts.publishedAt);
  if (opts.variant) await page.locator('#variantLabel').fill(opts.variant);
  await page.getByRole('button', { name: 'Tambah distribusi' }).click();
}

/** Fills metric rows by metric definition id, then returns without submitting. */
export async function fillSnapshot(
  page: Page,
  opts: { capturedAt: string; values?: Record<string, string>; modes?: Record<string, string>; note?: string },
) {
  await page.locator('#capturedAtLocal').fill(opts.capturedAt);
  if (opts.note) await page.locator('#note').fill(opts.note);
  for (const [id, mode] of Object.entries(opts.modes ?? {})) {
    await page.locator(`[id="mode__${id}"]`).selectOption(mode);
  }
  for (const [id, value] of Object.entries(opts.values ?? {})) {
    await page.locator(`[id="value__${id}"]`).fill(value);
  }
}
