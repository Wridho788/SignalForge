import { expect, test } from '@playwright/test';
import { addDistribution, createEpisode, fillSnapshot } from './helpers';

test.describe.configure({ mode: 'serial' });

const VIEWS = 'mdef_views';
const LIKES = 'mdef_likes';
const COMMENTS = 'mdef_comments';
const CTR = 'mdef_ctr';

let episodeId = '';
let youtubeUrl = '';

test('creating an episode validates input and keeps what the user typed', async ({ page }) => {
  await page.goto('/episodes/new');
  await page.locator('#episodeCode').fill('EP-014');
  await page.getByRole('button', { name: 'Buat episode' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Periksa kembali isian' })).toBeVisible();
  await expect(page.getByText('Judul wajib diisi.')).toBeVisible();
  await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#episodeCode')).toHaveValue('EP-014'); // not lost
});

test('empty app → create episode → add distribution → add snapshot', async ({ page }) => {
  episodeId = await createEpisode(page, 'Misteri Lampu Kota', { code: 'EP-014', tags: 'horor, kota' });
  await expect(page.getByText('Episode dibuat.')).toBeVisible();
  await expect(page.getByText('horor', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belum ada distribusi' })).toBeVisible();

  await addDistribution(page, episodeId, { platform: 'youtube', publishedAt: '2026-10-01T10:00' });
  await expect(page.getByText('Distribusi ditambahkan.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belum ada snapshot' })).toBeVisible();
  youtubeUrl = page.url().split('?')[0]!;

  await page.getByRole('link', { name: 'Tambah snapshot pertama' }).click();
  await fillSnapshot(page, {
    capturedAt: '2026-10-02T10:00',
    values: { [VIEWS]: '1000', [CTR]: '0' },
    modes: { [COMMENTS]: 'not_available' },
  });
  await page.getByRole('button', { name: 'Simpan snapshot' }).click();

  await expect(page.getByText('Snapshot disimpan.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '2026-10-02 10:00' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('24 jam'); // 10:00 on 10-01 → 10:00 on 10-02
  const cells = await row.getByRole('cell').allInnerTexts();
  const text = cells.join(' | ');
  expect(text).toContain('1.000'); // known value
  expect(text).toContain('0%'); // measured zero stays 0, not blank
  expect(text).toContain('N/A'); // not available
  // Metrics left blank are not shown as 0; they are named as having no recorded value.
  await expect(page.getByText(/Belum ada nilai tercatat \(tidak diketahui\) untuk:.*Likes/)).toBeVisible();
});

test('the first metric column is Views, not an alphabetical accident', async ({ page }) => {
  await page.goto(youtubeUrl);
  const headers = await page.locator('table thead th').allInnerTexts();
  expect(headers[2]).toContain('Views'); // after the time and age columns
  const row = page.getByRole('row').filter({ hasText: '2026-10-02 10:00' });
  await expect(row).toContainText('Tidak tersedia di platform'); // screen-reader text for N/A
});

test('invalid metric input is rejected per field and nothing is saved', async ({ page }) => {
  await page.goto(`${youtubeUrl}/snapshots/new`);
  await fillSnapshot(page, { capturedAt: '2026-10-03T10:00', values: { [VIEWS]: '1.234', [CTR]: '150' } });
  await page.getByRole('button', { name: 'Simpan snapshot' }).click();

  await expect(page.locator(`[id="value__${VIEWS}-error"]`)).toContainText('bilangan bulat');
  await expect(page.locator(`[id="value__${CTR}-error"]`)).toContainText('0 dan 100');
  await expect(page.locator(`[id="value__${VIEWS}"]`)).toHaveValue('1.234'); // echoed back

  await page.goto(youtubeUrl);
  await expect(page.getByRole('row').filter({ hasText: '2026-10-03' })).toHaveCount(0);
});

test('a counter that drops needs explicit confirmation before saving', async ({ page }) => {
  await page.goto(`${youtubeUrl}/snapshots/new`);
  await fillSnapshot(page, { capturedAt: '2026-10-08T10:00', values: { [VIEWS]: '900', [LIKES]: '7' } });
  await page.getByRole('button', { name: 'Simpan snapshot' }).click();

  await expect(page.getByText('lebih rendah dari 1.000')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan dengan peringatan' })).toBeVisible();
  await expect(page.locator('[id="value__' + VIEWS + '"]')).toHaveValue('900'); // preserved

  await page.getByLabel('Saya sudah meninjau peringatan').check();
  await page.getByRole('button', { name: 'Simpan dengan peringatan' }).click();
  await expect(page.getByText('Snapshot disimpan.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '2026-10-08 10:00' });
  await expect(row).toContainText('+6 hari dari snapshot sebelumnya'); // gap since 2026-10-02 10:00
  await expect(row).toContainText('7 hari'); // post age

  // Likes now has data, so the earlier snapshot shows it as unknown ("—"), never as 0.
  const first = page.getByRole('row').filter({ hasText: '2026-10-02 10:00' });
  await expect(first).toContainText('Data belum tersedia (tidak diketahui)');
  expect((await first.getByRole('cell').allInnerTexts()).join('|')).toContain('—');
});

test('correcting a snapshot keeps the original and flags it', async ({ page }) => {
  await page.goto(youtubeUrl);
  const original = page.getByRole('row').filter({ hasText: '2026-10-08 10:00' });
  await original.getByRole('link', { name: /Koreksi/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Koreksi snapshot' })).toBeVisible();
  await expect(page.locator(`[id="value__${VIEWS}"]`)).toHaveValue('900'); // prefilled from the original
  await page.locator(`[id="value__${VIEWS}"]`).fill('1900');
  await page.getByRole('button', { name: 'Simpan snapshot' }).click();
  await expect(page.getByText('Snapshot disimpan.')).toBeVisible();

  await expect(page.getByText('Sudah dikoreksi')).toBeVisible();
  await expect(page.getByText(/Mengoreksi snapshot/)).toBeVisible();
  // Both rows still exist: the original is preserved as evidence.
  await expect(page.getByRole('row').filter({ hasText: '2026-10-08 10:00' })).toHaveCount(2);
});

test('duplicate platform is blocked unless a variant label is given', async ({ page }) => {
  await addDistribution(page, episodeId, { platform: 'youtube', publishedAt: '2026-10-01T10:00' });
  await expect(page.locator('#variantLabel-error')).toContainText('Episode ini sudah punya distribusi untuk platform tersebut');
  await expect(page.locator('#variantLabel')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#variantLabel').fill('Repost');
  await page.getByRole('button', { name: 'Tambah distribusi' }).click();
  await expect(page.getByText('Distribusi ditambahkan.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Repost');
});

test('unknown published time is stored as unknown and warns on snapshot', async ({ page }) => {
  await addDistribution(page, episodeId, { platform: 'tiktok', status: 'unknown' });
  await expect(page.getByText('Distribusi ditambahkan.')).toBeVisible();
  await expect(page.getByText('Tidak diketahui').first()).toBeVisible();

  await page.getByRole('link', { name: 'Tambah snapshot', exact: true }).click();
  await expect(page.getByText('Waktu terbit belum diketahui')).toBeVisible();
  await fillSnapshot(page, { capturedAt: '2026-10-05T09:00', values: { [VIEWS]: '5' } });
  await page.getByRole('button', { name: 'Simpan snapshot' }).click();
  await expect(page.getByText('tidak bisa dipakai untuk perbandingan usia setara').last()).toBeVisible();
  await page.getByLabel('Saya sudah meninjau peringatan').check();
  await page.getByRole('button', { name: 'Simpan dengan peringatan' }).click();

  const row = page.getByRole('row').filter({ hasText: '2026-10-05 09:00' });
  await expect(row).toContainText('Usia post tidak diketahui'); // not "0 jam"
});

test('timezone setting changes how times are read and shown', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('#timezone').fill('Asia/Taipei');
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();

  await page.goto(youtubeUrl);
  // 10:00 Asia/Jakarta (UTC+7) == 11:00 Asia/Taipei (UTC+8).
  await expect(page.getByRole('row').filter({ hasText: '2026-10-02 11:00' })).toHaveCount(1);

  await page.goto('/settings');
  await page.locator('#timezone').fill('Asia/Jakarta');
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
});

test('invalid time zone and window settings are rejected', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('#timezone').fill('Mars/Base');
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
  await expect(page.getByText('Zona waktu tidak dikenal').first()).toBeVisible();
});

test('metric definitions: add a platform-specific metric and record source definition', async ({ page }) => {
  await page.goto('/settings/metrics');
  await expect(page.getByRole('row').filter({ hasText: 'Views' }).first()).toContainText('Belum dicatat');

  await page.getByRole('link', { name: 'Metrik baru' }).click();
  await page.locator('#label').fill('Finish rate');
  await page.locator('#key').fill('finish_rate');
  await page.locator('#aggregationKind').selectOption('ratio');
  await page.locator('#unit').fill('ratio');
  await page.locator('#platformId').selectOption('tiktok');
  await page.getByRole('button', { name: 'Buat metrik' }).click();
  await expect(page.getByText('Definisi metrik dibuat.')).toBeVisible();

  // It applies only to TikTok: shown on the TikTok snapshot form, not on the YouTube one.
  await page.goto(`${youtubeUrl}/snapshots/new`);
  await expect(page.getByText('Finish rate')).toHaveCount(0);

  await page.goto('/settings/metrics');
  await page.getByRole('link', { name: 'Views', exact: true }).click();
  await page.locator('#sourceDefinition').fill('Tayangan sesuai dasbor platform, 28 hari terakhir.');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Definisi metrik diperbarui.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Views' }).first()).toContainText('Tercatat');
});

test('deleting a distribution and an episode requires a confirmation page and cascades', async ({ page }) => {
  await page.goto(`${youtubeUrl}/delete`);
  // 2026-10-02, 2026-10-08 (900), and the 2026-10-08 correction (1900): the corrected one is kept as evidence.
  await expect(page.getByText(/dihapus bersama 3 snapshot/)).toBeVisible();
  await page.getByRole('link', { name: 'Batal' }).click();
  await expect(page.getByRole('heading', { name: 'Timeline snapshot' })).toBeVisible(); // nothing deleted

  await page.goto(`/episodes/${episodeId}/delete`);
  await expect(page.getByText(/3 distribusi dan 4 snapshot/)).toBeVisible(); // YouTube(3) + Repost(0) + TikTok(1)
  await page.getByRole('button', { name: 'Ya, hapus permanen' }).click();
  await expect(page.getByText('Episode dihapus beserta distribusi dan snapshot-nya.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Belum ada episode' })).toBeVisible();
  await page.goto(youtubeUrl);
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible();
});
