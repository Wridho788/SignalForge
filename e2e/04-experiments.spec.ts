import { expect, test, type Page } from '@playwright/test';
import { seedPost } from './helpers';

// Runs after 03-analytics, whose posts are still in the database and are reused here.
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const VIEWS = 'mdef_views';
let expUrl = '';

async function fillDefinition(page: Page, o: { title: string; successType?: string; successValue?: string; design?: string }) {
  await page.locator('#title').fill(o.title);
  await page.locator('#hypothesis').fill('Hook berbentuk pertanyaan menaikkan views pada 24 jam.');
  await page.locator('#variableToTest').fill('Bentuk kalimat hook');
  if (o.design) await page.locator('#design').selectOption(o.design);
  await page.locator('#primaryMetricId').selectOption(VIEWS);
  await page.locator('#successType').selectOption(o.successType ?? 'min_relative_gain');
  await page.locator('#successValue').fill(o.successValue ?? '20');
}

async function link(page: Page, label: string, role: 'baseline' | 'variant' | 'supporting') {
  // selectOption needs an exact label or a value; resolve the value from the option that starts with `label`.
  const value = await page.locator('#distributionId option').evaluateAll(
    (opts, prefix) => (opts as HTMLOptionElement[]).find((o) => o.textContent?.trim().startsWith(prefix))?.value ?? '',
    label,
  );
  expect(value, `no linkable option for ${label}`).not.toBe('');
  await page.locator('#distributionId').selectOption(value);
  await page.locator('#role').selectOption(role);
  await page.getByRole('button', { name: 'Tautkan' }).click();
  // Wait for the new row itself: the success notice alone would also match the previous link's notice.
  await expect(page.getByRole('row').filter({ hasText: label })).toHaveCount(1);
}

test('seed extra posts for a clean baseline/variant comparison', async ({ page }) => {
  // Baselines ~100 views at 24h, variants ~150: a +50% gain against a 20% threshold.
  await seedPost(page, { title: 'Exp Base A', platform: 'facebook', publishedAt: '2026-10-01T10:00', snapshots: [{ at: '2026-10-02T10:00', values: { [VIEWS]: '100' } }] });
  await seedPost(page, { title: 'Exp Base B', platform: 'facebook', publishedAt: '2026-10-02T10:00', snapshots: [{ at: '2026-10-03T10:00', values: { [VIEWS]: '120' } }] });
  await seedPost(page, { title: 'Exp Var A', platform: 'facebook', publishedAt: '2026-10-03T10:00', snapshots: [{ at: '2026-10-04T10:00', values: { [VIEWS]: '150' } }] });
  await seedPost(page, { title: 'Exp Var B', platform: 'facebook', publishedAt: '2026-10-04T10:00', snapshots: [{ at: '2026-10-05T10:00', values: { [VIEWS]: '170' } }] });
  await seedPost(page, { title: 'Exp No Data', platform: 'facebook', publishedAt: '2026-10-05T10:00', snapshots: [] });
});

test('empty state, then create a draft with a pre-declared success criterion', async ({ page }) => {
  await page.goto('/experiments');
  await expect(page.getByRole('heading', { name: 'Belum ada eksperimen' })).toBeVisible();

  await page.getByRole('link', { name: 'Buat eksperimen pertama' }).click();
  await page.getByRole('button', { name: 'Buat eksperimen' }).click();
  await expect(page.getByText('Judul wajib diisi.')).toBeVisible();
  await expect(page.getByText('Hipotesis wajib diisi.')).toBeVisible();

  await fillDefinition(page, { title: 'Hook pertanyaan vs pernyataan' });
  await page.getByRole('button', { name: 'Buat eksperimen' }).click();
  await expect(page.getByText('Eksperimen dibuat sebagai Draf.')).toBeVisible();
  expUrl = page.url().split('?')[0]!;

  await expect(page.getByText('Median Views varian minimal 20% lebih tinggi daripada median baseline pada usia 24 jam ± 6 jam, dalam platform yang sama.')).toBeVisible();
  await expect(page.getByText('Draf', { exact: true })).toBeVisible();
});

test('cannot start without a baseline and a variant', async ({ page }) => {
  await page.goto(expUrl);
  await page.getByRole('button', { name: 'Tandai Direncanakan' }).click();
  await expect(page.getByText('Status eksperimen diperbarui.')).toBeVisible();

  await page.getByRole('button', { name: 'Mulai eksperimen' }).click();
  await expect(page.getByRole('alert').getByText(/tautkan minimal satu distribusi baseline dan satu distribusi varian/i)).toBeVisible();
  await expect(page.getByText('Direncanakan', { exact: true })).toBeVisible(); // unchanged
});

test('link baselines and variants, then start', async ({ page }) => {
  await page.goto(expUrl);
  await link(page, 'Exp Base A', 'baseline');
  await link(page, 'Exp Base B', 'baseline');
  await link(page, 'Exp Var A', 'variant');
  await link(page, 'Exp Var B', 'variant');
  await link(page, 'Exp No Data', 'variant');

  await page.getByRole('button', { name: 'Mulai eksperimen' }).click();
  await expect(page.getByText('Status eksperimen diperbarui.')).toBeVisible();
  await expect(page.getByText('Berjalan', { exact: true })).toBeVisible();
});

test('evidence is per platform, excludes posts without a comparable value, and never claims causality', async ({ page }) => {
  await page.goto(expUrl);
  const ev = page.locator('#evidence-heading').locator('xpath=ancestor::section');

  await expect(ev).toContainText('Facebook');
  await expect(ev.getByText('Ambang tercapai (indikasi)')).toBeVisible();
  await expect(ev).toContainText('2 sebanding dari 2 tertaut'); // baselines
  await expect(ev).toContainText('2 sebanding dari 3 tertaut'); // variants: "Exp No Data" excluded
  await expect(ev).toContainText('1 varian tidak punya nilai sebanding dan tidak dihitung (bukan 0).');
  await expect(ev).toContainText('+45,5%'); // median 160 vs 110

  await expect(ev.getByText(/tidak ada randomisasi, jadi hasil hanya indikasi dan bukan bukti sebab-akibat/)).toBeVisible();
  await expect(ev.getByText(/Sampel kecil/)).toBeVisible();
  // Nothing on the page claims proof or cause.
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/terbukti menyebabkan|membuktikan bahwa/i);
});

test('the definition is locked once running', async ({ page }) => {
  await page.goto(expUrl);
  await expect(page.getByRole('link', { name: 'Ubah definisi' })).toHaveCount(0);
  await page.goto(`${expUrl}/edit`);
  // The route streams (loading.tsx) before notFound(), so assert the rendered page, not the HTTP status.
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible();
});

test('a note is appended to the decision log', async ({ page }) => {
  await page.goto(expUrl);
  await page.locator('#note').fill('Varian B terbit saat jam ramai, perlu diingat saat membaca hasil.');
  await page.getByRole('button', { name: 'Simpan catatan' }).click();
  await expect(page.getByText('Catatan ditambahkan ke log.')).toBeVisible();
  const log = page.locator('#log-heading').locator('xpath=ancestor::section');
  await expect(log.getByRole('listitem').first()).toContainText('Catatan');
  await expect(log).toContainText('jam ramai');
});

test('recording an outcome requires a decision and learning, and closes the experiment', async ({ page }) => {
  await page.goto(expUrl);
  await page.getByRole('link', { name: 'Catat hasil' }).click();
  await expect(page.getByText(/Kriteria yang ditetapkan sebelumnya/)).toBeVisible();

  await page.getByRole('button', { name: 'Simpan hasil' }).click();
  await expect(page.getByText('Pembelajaran wajib diisi.')).toBeVisible();

  await page.locator('#decision').selectOption('iterate');
  await page.locator('#learning').fill('Indikasi kenaikan pada Facebook; ulangi dengan sampel lebih besar sebelum menyimpulkan.');
  await page.getByRole('button', { name: 'Simpan hasil' }).click();
  await expect(page.getByText('Hasil dan pembelajaran dicatat.')).toBeVisible();

  await expect(page.getByText('Selesai', { exact: true })).toBeVisible();
  await expect(page.locator('header').getByText('Keputusan: Iterasi')).toBeVisible();
  await expect(page.locator('#outcome-heading').locator('xpath=ancestor::section')).toContainText('ulangi dengan sampel lebih besar');
  // Finished: no further transitions, no link editing.
  await expect(page.getByRole('button', { name: 'Batalkan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lepas' })).toHaveCount(0);
  await expect(page.locator('#distributionId')).toHaveCount(0);
});

test('an inconclusive outcome is a first-class result', async ({ page }) => {
  await page.goto('/experiments/new');
  await fillDefinition(page, { title: 'Durasi 30 detik vs 60 detik', design: 'before_after' });
  await page.getByRole('button', { name: 'Buat eksperimen' }).click();
  await page.waitForURL(/\/experiments\/[0-9a-f-]{36}(\?|$)/);
  const url = page.url().split('?')[0]!;

  await page.getByRole('button', { name: 'Tandai Direncanakan' }).click();
  await expect(page.getByText('Status eksperimen diperbarui.')).toBeVisible(); // wait for the redirect before linking
  await link(page, 'Exp Base A', 'baseline');
  await link(page, 'Exp No Data', 'variant');
  await page.getByRole('button', { name: 'Mulai eksperimen' }).click();
  await expect(page.getByText('Berjalan', { exact: true })).toBeVisible();

  const ev = page.locator('#evidence-heading').locator('xpath=ancestor::section');
  await expect(ev.getByText(/Data belum cukup/)).toBeVisible();
  await expect(ev.getByText(/sebelum\/sesudah tidak dapat memisahkan efek variabel/)).toBeVisible();

  await page.getByRole('link', { name: 'Catat hasil' }).click();
  await expect(page.getByText(/Pertimbangkan keputusan/)).toBeVisible();
  await page.locator('#decision').selectOption('inconclusive');
  await page.locator('#learning').fill('Varian belum punya snapshot pada usia 24 jam; tidak ada yang bisa disimpulkan.');
  await page.getByRole('button', { name: 'Simpan hasil' }).click();
  await expect(page.getByText('Hasil dan pembelajaran dicatat.')).toBeVisible(); // let the action finish before navigating

  await page.goto(url);
  await expect(page.getByText('Tidak konklusif', { exact: true }).first()).toBeVisible();
});

test('experiments list filters by status and the overview shows decisions', async ({ page }) => {
  await page.goto('/experiments');
  await expect(page.getByRole('row')).toHaveCount(3); // header + 2 experiments
  await page.getByRole('link', { name: 'Tidak konklusif', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('row').filter({ hasText: 'Durasi 30 detik' })).toBeVisible();

  await page.goto('/');
  const section = page.locator('#exp-heading').locator('xpath=ancestor::section');
  await expect(section.getByText('Tidak ada eksperimen berjalan.')).toBeVisible();
  await expect(section).toContainText('Iterasi');
  await expect(page.getByRole('link', { name: /^04\s*Improve/ })).toHaveAttribute('href', '/experiments');
});

test('a draft can be deleted; a finished experiment cannot', async ({ page }) => {
  await page.goto('/experiments/new');
  await fillDefinition(page, { title: 'Draf untuk dihapus' });
  await page.getByRole('button', { name: 'Buat eksperimen' }).click();
  await page.waitForURL(/\/experiments\/[0-9a-f-]{36}(\?|$)/);
  const url = page.url().split('?')[0]!;
  await page.getByRole('link', { name: 'Hapus…' }).click();
  await expect(page.getByText(/tidak.*ikut terhapus/)).toBeVisible();
  await page.getByRole('button', { name: 'Ya, hapus permanen' }).click();
  await expect(page.getByText('Eksperimen dihapus.')).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible();

  await page.goto(`${expUrl}/delete`); // a completed experiment cannot be deleted
  await expect(page.getByRole('heading', { name: 'Halaman atau data tidak ditemukan' })).toBeVisible();
});

test('experiment pages fit 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const url of ['/experiments', expUrl, '/experiments/new']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${url} overflows`).toBe(true);
  }
});
