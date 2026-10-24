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

export interface SeedSnapshot {
  /** Local `YYYY-MM-DDTHH:mm` in the app time zone (Asia/Jakarta in E2E). */
  at: string;
  values?: Record<string, string>;
  modes?: Record<string, string>;
  /** Confirm the warning step (e.g. unknown publish time). */
  confirm?: boolean;
}

/** Creates an episode + one distribution + snapshots entirely through the UI. */
export async function seedPost(
  page: Page,
  opts: {
    title: string;
    platform: 'facebook' | 'youtube' | 'tiktok';
    publishedAt?: string;
    tags?: string;
    snapshots: SeedSnapshot[];
  },
): Promise<{ episodeId: string; distUrl: string }> {
  const episodeId = await createEpisode(page, opts.title, { tags: opts.tags });
  await addDistribution(page, episodeId, {
    platform: opts.platform,
    publishedAt: opts.publishedAt,
    status: opts.publishedAt ? undefined : 'unknown',
  });
  await page.waitForURL(/\/distributions\/[0-9a-f-]{36}(\?|$)/);
  const distUrl = page.url().split('?')[0]!;
  for (const s of opts.snapshots) {
    await page.goto(`${distUrl}/snapshots/new`);
    await fillSnapshot(page, { capturedAt: s.at, values: s.values, modes: s.modes });
    await page.getByRole('button', { name: 'Simpan snapshot' }).click();
    if (s.confirm) {
      await page.getByLabel('Saya sudah meninjau peringatan').check();
      await page.getByRole('button', { name: 'Simpan dengan peringatan' }).click();
    }
    await page.waitForURL(/notice=snapshot-created/);
  }
  return { episodeId, distUrl };
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
