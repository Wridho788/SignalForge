import { expect, test, type Page } from '@playwright/test';
import { buildCsv, MIXED_ROWS, VALID_ROWS } from './fixtures';

// Runs after 04-experiments: earlier data is still present, so restore is exercised on a realistic database.
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function upload(page: Page, name: string, buffer: Buffer, mimeType = 'text/csv') {
  await page.goto('/imports');
  await page.locator('#file').setInputFiles({ name, mimeType, buffer });
  await page.getByRole('button', { name: 'Pratinjau impor' }).click();
}

let backupName = '';
let backupBytes: Buffer;

test('the import hub explains the format and serves a versioned template with marked samples', async ({ page, request }) => {
  await page.goto('/imports');
  await expect(page.getByRole('heading', { level: 1, name: 'Impor CSV' })).toBeVisible();
  await expect(page.getByText('Kosong berarti tidak diketahui, bukan 0.')).toBeVisible();

  const res = await request.get('/imports/template');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain('attachment');
  expect(res.headers()['content-disposition']).toContain('signalforge-template-v1.csv');
  expect(res.headers()['cache-control']).toBe('no-store');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  const body = await res.text();
  expect(body).toContain('schema_version,episode_code,episode_title,platform');
  expect(body).toContain('[CONTOH]');
});

test('rejects wrong file types and unreadable files before anything is staged', async ({ page }) => {
  await upload(page, 'notes.txt', Buffer.from('a,b\n1,2'), 'text/plain');
  await expect(page.getByRole('alert').filter({ hasText: 'Hanya file .csv yang diterima.' })).toBeVisible();

  await upload(page, 'bad.csv', Buffer.from([0xff, 0xfe, 0x00, 0xfa]));
  await expect(page.getByRole('alert').filter({ hasText: 'Encoding tidak valid' })).toBeVisible();

  await upload(page, 'headers.csv', Buffer.from('a,b\n1,2\n'));
  await expect(page.getByRole('alert').filter({ hasText: 'Header CSV tidak sesuai template v1' })).toBeVisible();

  await page.goto('/imports');
  await expect(page.getByText('Belum ada impor.')).toBeVisible(); // none of them created a job
});

test('a file with errors shows per-row problems and cannot be imported all-or-nothing', async ({ page, request }) => {
  await upload(page, 'campuran.csv', buildCsv(MIXED_ROWS));
  await expect(page.getByRole('heading', { level: 1, name: 'Pratinjau impor' })).toBeVisible();
  const url = page.url();

  const summary = page.locator('#plan-heading').locator('xpath=ancestor::section');
  await expect(summary).toContainText('Episode: 1 baru');
  await expect(summary).toContainText('Snapshot: 1 baru (1 nilai metrik)');

  const errors = page.locator('#errors-heading').locator('xpath=ancestor::section');
  await expect(errors).toContainText('Kesalahan per baris (3)'); // lines 3 (bad value), 4 (dropped with it), 5 (platform)
  await expect(errors.getByRole('row').filter({ hasText: 'bilangan bulat' })).toContainText('3'); // line 3, 1.5 for a counter
  await expect(errors.getByRole('row').filter({ hasText: 'Dilewati' })).toContainText('4'); // line 4 shares the bad snapshot
  await expect(errors.getByRole('row').filter({ hasText: 'platform harus facebook, youtube, atau tiktok' })).toContainText('5');

  const csv = await request.get(`${new URL(url).pathname}/errors`);
  expect(csv.status()).toBe(200);
  const csvText = await csv.text();
  expect(csvText).toContain('line,column,message');
  expect(csvText).not.toContain('instagram'); // cell contents are not echoed

  await page.getByRole('button', { name: 'Impor sekarang' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Masih ada 3 baris yang ditolak' })).toBeVisible();
  await page.goto('/episodes');
  await expect(page.getByText('Campuran Baik')).toHaveCount(0); // nothing was imported
});

test('importing only the valid rows is explicit, and the rejected count is recorded', async ({ page }) => {
  await upload(page, 'campuran.csv', buildCsv(MIXED_ROWS));
  await page.getByLabel(/Impor hanya baris yang valid dan abaikan 3 baris/).check();
  await page.getByRole('button', { name: 'Impor sekarang' }).click();

  await expect(page.getByText('Impor selesai.')).toBeVisible();
  await expect(page.getByText('Selesai', { exact: true })).toBeVisible();
  await expect(page.locator('dl').getByText('Ditolak').locator('xpath=following-sibling::dd')).toHaveText('3');
  await expect(page.getByText('Isi file tidak disimpan setelah impor selesai')).toBeVisible();

  await page.goto('/episodes');
  await expect(page.getByRole('link', { name: 'Campuran Baik' })).toBeVisible();
  await expect(page.getByText('Campuran Buruk')).toHaveCount(0);
  await expect(page.getByText('Platform Salah')).toHaveCount(0);
});

test('a valid file previews cleanly and imports episodes, distributions and snapshots with provenance', async ({ page }) => {
  await upload(page, 'valid.csv', buildCsv(VALID_ROWS));
  await expect(page.getByText('Semua baris valid')).toBeVisible();
  const summary = page.locator('#plan-heading').locator('xpath=ancestor::section');
  await expect(summary).toContainText('Episode: 3 baru, 0 sudah ada');
  await expect(summary).toContainText('Distribusi: 4 baru');
  await expect(summary).toContainText('Snapshot: 4 baru (8 nilai metrik)');
  await expect(summary).toContainText('1 baris memakai waktu tanpa offset'); // the single tiktok row written as local time

  await page.getByRole('button', { name: 'Impor sekarang' }).click();
  await expect(page.getByText('Impor selesai.')).toBeVisible();

  await page.goto('/episodes?q=Impor+Satu');
  await page.getByRole('link', { name: 'Impor Satu' }).click();
  await page.getByRole('link', { name: /YouTube/ }).click();
  const first = page.getByRole('row').filter({ hasText: '2026-10-02 10:00' });
  await expect(first).toHaveCount(1); // allInnerTexts() does not wait, so wait for the row first
  const cells = (await first.getByRole('cell').allInnerTexts()).join(' | ');
  expect(cells).toContain('0'); // measured zero views
  expect(cells).toContain('4,5%'); // ratio entered as percent
  expect(cells).toContain('N/A'); // saves: not available
  expect(cells).toContain('Dari dasbor'); // note
  const second = page.getByRole('row').filter({ hasText: '2026-10-03 10:00' });
  await expect(second).toContainText('300');
  await expect(second).toContainText('-2');
  await expect(second).toContainText('+24 jam dari snapshot sebelumnya'); // gap since the previous snapshot
  await expect(page.getByText('24 jam').first()).toBeVisible(); // post age derived from the imported timestamps

  // Provenance carries into analytics.
  await page.goto('/analytics?episode=' + (await page.evaluate(() => location.pathname.split('/')[2])));
  await expect(page.getByRole('cell', { name: /csv_import/ }).first()).toBeVisible();
});

test('re-importing the same file finds the duplicates; skipping changes nothing, superseding keeps the original', async ({ page }) => {
  await upload(page, 'valid-again.csv', buildCsv(VALID_ROWS));
  const summary = page.locator('#plan-heading').locator('xpath=ancestor::section');
  await expect(summary).toContainText('Episode: 0 baru, 3 sudah ada');
  await expect(summary).toContainText('4 bertabrakan dengan snapshot yang sudah ada');

  await page.getByRole('button', { name: 'Impor sekarang' }).click(); // default policy: skip
  await expect(page.getByRole('alert').filter({ hasText: 'Tidak ada yang bisa diimpor' })).toBeVisible();

  await page.locator('#duplicatePolicy').selectOption('supersede');
  await page.getByRole('button', { name: 'Impor sekarang' }).click();
  await expect(page.getByText('Impor selesai.')).toBeVisible();

  await page.goto('/episodes?q=Impor+Satu');
  await page.getByRole('link', { name: 'Impor Satu' }).click();
  await page.getByRole('link', { name: /YouTube/ }).click();
  await expect(page.getByText('Sudah dikoreksi').first()).toBeVisible();
  await expect(page.getByText('Mengoreksi snapshot').first()).toBeVisible();
  expect(await page.getByRole('row').filter({ hasText: '2026-10-02 10:00' }).count()).toBe(2); // original + replacement
});

test('cancelling a preview leaves no data and drops the staged file', async ({ page }) => {
  const rows = [{ ...VALID_ROWS[0]!, episode_code: 'EP-CANCEL', episode_title: 'Akan Dibatalkan' }];
  await upload(page, 'cancel.csv', buildCsv(rows));
  await page.getByRole('button', { name: 'Batalkan impor' }).click();
  await expect(page.getByText('Impor dibatalkan; tidak ada data yang diubah.')).toBeVisible();
  await page.goto('/episodes');
  await expect(page.getByText('Akan Dibatalkan')).toHaveCount(0);
  await page.getByRole('link', { name: 'Impor & Ekspor' }).click();
  await page.getByRole('link', { name: 'cancel.csv' }).click();
  await expect(page.getByText('Dibatalkan', { exact: true })).toBeVisible();
});

test('export: only current snapshots, formula-safe text cells, plain numbers, platform filter', async ({ page, request }) => {
  await page.goto('/imports/export');
  await expect(page.getByRole('heading', { level: 1, name: 'Ekspor CSV' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unduh CSV' })).toBeVisible();

  const all = await request.get('/imports/export/download');
  expect(all.status()).toBe(200);
  expect(all.headers()['content-disposition']).toMatch(/attachment; filename="signalforge-export-\d{4}-\d{2}-\d{2}\.csv"/);
  const text = (await all.text()).replace(/^﻿/, '');
  const [header, ...lines] = text.trim().split('\r\n');
  expect(header).toBe('schema_version,episode_code,episode_title,platform,variant_label,published_at,post_url,captured_at,metric_key,value_state,value,unit,note');
  expect(text).toContain("'=HYPERLINK("); // guarded
  expect(text).not.toMatch(/(^|,)"?=HYPERLINK/m); // never a bare formula cell
  expect(text).toContain(',followers_gained,known,-2,'); // numbers untouched
  expect(text).toContain(',click_through_rate,known,4.5,ratio,');
  expect(text).toMatch(/EP-IMP-2,Impor Dua \(hanya struktur\),youtube,,2026-10-01T03:00:00.000Z,https:\/\/example.com\/post\/2,,,,,,/); // structure-only row
  // EP-IMP-1's zero-views reading was re-imported as a superseding snapshot: exactly one copy (the current one) is exported.
  expect(lines.filter((l) => l.includes('EP-IMP-1,') && l.includes(',youtube,') && l.includes(',views,known,0,')).length).toBe(1);

  const tiktok = await request.get('/imports/export/download?platform=tiktok');
  const tt = await tiktok.text();
  expect(tt).toContain(',tiktok,');
  expect(tt).not.toContain(',youtube,');

  // Hostile query values are ignored, not interpreted.
  const odd = await request.get("/imports/export/download?platform=' OR 1=1--&episode=../../x");
  expect(odd.status()).toBe(200);
  expect((await odd.text()).split('\r\n').length).toBeGreaterThan(5); // fell back to "everything"
});

test('backup: create, list, and download a real SQLite file; names are strictly validated', async ({ page, request }) => {
  await page.goto('/imports/backup');
  await page.getByRole('button', { name: 'Buat cadangan sekarang' }).click();
  await expect(page.getByText('Cadangan dibuat.')).toBeVisible();

  const list = page.getByRole('table', { name: /Cadangan database/ });
  const row = list.getByRole('row').filter({ hasText: 'Manual' }).first();
  backupName = (await row.getByRole('rowheader').innerText()).trim();
  expect(backupName).toMatch(/^manual-.*\.sqlite$/);

  const res = await request.get(`/imports/backup/download/${encodeURIComponent(backupName)}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain(`filename="${backupName}"`);
  backupBytes = await res.body();
  expect(backupBytes.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');

  for (const bad of ['..%2Fsignalforge.sqlite', '..%5Csignalforge.sqlite', 'nope.sqlite', 'signalforge.sqlite', '%2Fetc%2Fpasswd', 'x.txt']) {
    expect((await request.get(`/imports/backup/download/${bad}`)).status(), bad).toBe(404);
  }
});

test('restore: invalid files are refused with a clear reason', async ({ page }) => {
  const tryRestore = async (name: string, buffer: Buffer, expected: string) => {
    await page.goto('/imports/backup');
    await page.locator('#file').last().setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await page.getByRole('button', { name: 'Periksa cadangan' }).click();
    await expect(page.getByRole('alert').filter({ hasText: expected })).toBeVisible();
  };
  await tryRestore('data.csv', buildCsv(VALID_ROWS), 'Bukan file database SQLite.');
  await tryRestore('fake.sqlite', Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(200, 7)]), 'tidak dapat dibaca');
});

test('restore: needs an explicit typed confirmation, writes a pre-restore backup, and brings back the earlier state', async ({ page }) => {
  // Change the data after the backup was taken.
  await page.goto('/episodes/new');
  await page.locator('#title').fill('Dibuat Setelah Cadangan');
  await page.getByRole('button', { name: 'Buat episode' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dibuat Setelah Cadangan' })).toBeVisible();

  await page.goto('/imports/backup');
  await page.locator('#file').last().setInputFiles({ name: backupName, mimeType: 'application/octet-stream', buffer: backupBytes });
  await page.getByRole('button', { name: 'Periksa cadangan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Konfirmasi pemulihan' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Perbandingan data saat ini/ })).toBeVisible();
  const confirmUrl = page.url();

  await page.getByRole('button', { name: 'Pulihkan data' }).click();
  await expect(page.getByText('Ketik PULIHKAN persis seperti itu untuk melanjutkan.')).toBeVisible();
  await page.locator('#confirmText').fill('pulihkan'); // wrong case must not work
  await page.getByRole('button', { name: 'Pulihkan data' }).click();
  await expect(page.getByText('Ketik PULIHKAN persis')).toBeVisible();

  await page.locator('#confirmText').fill('PULIHKAN');
  await page.getByRole('button', { name: 'Pulihkan data' }).click();
  await expect(page.getByText('Data dipulihkan.')).toBeVisible();

  await page.goto('/episodes');
  await expect(page.getByText('Dibuat Setelah Cadangan')).toHaveCount(0); // gone: state before the change
  await expect(page.getByRole('link', { name: 'Impor Satu' })).toBeVisible(); // present at backup time

  await page.goto('/imports/backup');
  await expect(page.getByRole('row').filter({ hasText: 'Sebelum pemulihan' })).toHaveCount(1);
  expect((await page.goto(confirmUrl))?.status()).toBeLessThan(500);
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible(); // staged file is gone

  // The restored app keeps working, and append-only protection is intact.
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { level: 1, name: 'Analitik' })).toBeVisible();
});

test('import/export/backup pages fit 360px and have labelled controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const url of ['/imports', '/imports/export', '/imports/backup']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${url} overflows`).toBe(true);
    // Hidden inputs are React's Server Action bookkeeping fields; only visible controls need labels.
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('main input:not([type=hidden]), main select')].filter((el) => !(el as HTMLInputElement).labels?.length).length);
    expect(unnamed, `${url} unlabelled controls`).toBe(0);
  }
});
