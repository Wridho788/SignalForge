import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedPost } from './helpers';

// AI features run against in-process FAKE providers (scripts/e2e-server.mjs sets SIGNALFORGE_AI_MODE=fake):
// no CLI is spawned and nothing leaves the machine. The scenario is a JSON file in the data directory.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const SCENARIO_FILE = path.join(process.cwd(), '.data', 'e2e', 'fake-ai.json');
type Scenario = Record<string, unknown>;
function scenario(value: { claude?: Scenario; codex?: Scenario } | null) {
  fs.mkdirSync(path.dirname(SCENARIO_FILE), { recursive: true });
  if (value === null) fs.rmSync(SCENARIO_FILE, { force: true });
  else fs.writeFileSync(SCENARIO_FILE, JSON.stringify(value));
}

const TAG = 'ai-e2e';
const AI_URL = `/analytics/ai?tag=${TAG}`;
const ORIGIN = { origin: 'http://127.0.0.1:3100' };

const card = (page: Page, provider: 'claude' | 'codex') => page.locator(`section[data-provider="${provider}"]`);

async function review(page: Page, opts: { provider?: 'Claude' | 'Codex'; titles?: boolean } = {}) {
  await page.goto(AI_URL);
  await page.getByRole('radio', { name: new RegExp(opts.provider ?? 'Claude') }).check();
  if (opts.titles) await page.getByLabel('Sertakan judul episode').check();
  await page.getByRole('button', { name: 'Tinjau data yang akan dikirim' }).click();
  await expect(page.getByTestId('consent')).toBeVisible();
}

test('seed posts for analysis', async ({ page }) => {
  await seedPost(page, { title: 'Ai Satu', platform: 'youtube', publishedAt: '2026-10-01T10:00', tags: TAG, snapshots: [{ at: '2026-10-02T10:00', values: { mdef_views: '900' } }] });
  await seedPost(page, { title: 'Ai Dua', platform: 'youtube', publishedAt: '2026-10-02T10:00', tags: TAG, snapshots: [{ at: '2026-10-03T10:00', values: { mdef_views: '0' } }] });
  await seedPost(page, { title: 'Ai Tiga', platform: 'tiktok', publishedAt: '2026-10-01T10:00', tags: TAG, snapshots: [{ at: '2026-10-02T10:00', values: { mdef_likes: '5' } }] }); // views unknown
});

test('disconnected by default: honest status, no token field, and the dashboard keeps working', async ({ page }) => {
  scenario(null);
  await page.goto('/settings/ai-connections');
  await expect(page.getByRole('heading', { level: 1, name: 'Koneksi AI' })).toBeVisible();
  await expect(page.getByText('Mode uji').first()).toBeVisible();
  for (const p of ['claude', 'codex'] as const) {
    await expect(card(page, p)).toContainText('Belum terpasang');
    await expect(card(page, p).getByRole('button', { name: 'Uji koneksi' })).toBeDisabled();
  }
  // Never a place to paste a credential.
  expect(await page.locator('main input:not([type=radio]):not([type=checkbox]), main textarea').count()).toBe(0);
  await expect(page.getByText(/tidak pernah menampilkan, meminta, atau menyimpan token/)).toBeVisible();

  await page.goto('/analytics');
  await expect(page.getByRole('heading', { level: 1, name: 'Analitik' })).toBeVisible();
  await page.goto('/analytics/ai?tag=' + TAG);
  await expect(page.getByTestId('not-connected-hint')).toContainText('belum terhubung');
  await expect(page.getByRole('button', { name: 'Tinjau data yang akan dikirim' })).toBeDisabled();
});

test('setup guide: OS selector, copyable official commands, official links, billing note', async ({ page }) => {
  await page.goto('/settings/ai-connections');
  const claude = card(page, 'claude');
  await claude.getByRole('button', { name: 'Cara menyiapkan' }).click();
  await claude.getByRole('radio', { name: 'Windows' }).check();
  await expect(claude.getByText('irm https://claude.ai/install.ps1 | iex')).toBeVisible();
  await claude.getByRole('radio', { name: 'macOS' }).check();
  await expect(claude.getByText('curl -fsSL https://claude.ai/install.sh | bash')).toBeVisible();
  await expect(claude.getByText('claude auth login --claudeai')).toBeVisible();
  await expect(claude.getByRole('button', { name: /Salin perintah: claude auth login/ })).toBeVisible();
  const link = claude.getByRole('link', { name: /Claude Code: instalasi dan autentikasi/ });
  await expect(link).toHaveAttribute('href', 'https://code.claude.com/docs/en/getting-started');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(claude).toContainText('Langganan atau API?');
  await claude.getByText('Pemecahan masalah').click();
  await expect(claude).toContainText('CLI tidak ditemukan setelah dipasang');
});

test('status, consented connection test, and failure codes', async ({ page }) => {
  scenario({ claude: { health: 'connected', inference: 'ok' }, codex: { health: 'not_authenticated' } });
  await page.goto('/settings/ai-connections');
  const claude = card(page, 'claude');
  await claude.getByRole('button', { name: 'Periksa status' }).click();
  await expect(claude).toContainText('Terhubung');
  // Status is cached until a check is asked for (opening the page never spawns anything).
  await card(page, 'codex').getByRole('button', { name: 'Periksa status' }).click();
  await expect(card(page, 'codex')).toContainText('Perlu masuk');

  // The test sends a real request, so it asks first and does nothing until confirmed.
  await claude.getByRole('button', { name: 'Uji koneksi' }).click();
  await expect(claude).toContainText('Uji koneksi mengirim satu permintaan nyata');
  await claude.getByRole('button', { name: 'Batal' }).click();
  await expect(claude.getByTestId('claude-test-result')).toHaveCount(0);

  await claude.getByRole('button', { name: 'Uji koneksi' }).click();
  await claude.getByRole('button', { name: 'Kirim permintaan uji' }).click();
  await expect(claude.getByTestId('claude-test-result')).toContainText('Uji berhasil');
  await expect(claude).toContainText('Uji permintaan terakhir: berhasil');

  scenario({ claude: { health: 'connected', inference: 'RATE_LIMITED' } });
  await claude.getByRole('button', { name: 'Uji koneksi' }).click();
  await claude.getByRole('button', { name: 'Kirim permintaan uji' }).click();
  await expect(claude.getByTestId('claude-test-result')).toContainText('RATE_LIMITED');
  await claude.getByText('Diagnostik aman').click();
  await expect(claude).toContainText('Tidak ada token, path kredensial, atau keluaran mentah penyedia');
});

test('codex sign-in uses the device-code flow and never shows a token', async ({ page }) => {
  scenario({ codex: { health: 'not_authenticated', loginMs: 600 } });
  await page.goto('/settings/ai-connections');
  const codex = card(page, 'codex');
  await codex.getByRole('button', { name: 'Periksa status' }).click();
  await expect(codex).toContainText('Perlu masuk');
  await codex.getByRole('button', { name: 'Masuk', exact: true }).click();
  const region = codex.getByRole('region', { name: 'Masuk dengan kode perangkat' });
  await expect(region.getByTestId('login-code')).toHaveText('FAKE-1234');
  await expect(region.getByRole('link', { name: /chatgpt\.com/ })).toHaveAttribute('href', 'https://chatgpt.com/device');
  await expect(region).toContainText('bukan token');
  // Completion is detected by polling, then a local re-check flips the status.
  await expect(codex).toContainText('Terhubung', { timeout: 15_000 });
  await expect(region).toHaveCount(0);

  scenario({ codex: { health: 'not_authenticated', loginMs: 30_000 } });
  await codex.getByRole('button', { name: 'Hubungkan ulang' }).click();
  await expect(codex.getByTestId('login-code')).toBeVisible();
  await codex.getByRole('button', { name: 'Batalkan login' }).click();
  await expect(codex.getByTestId('login-code')).toHaveCount(0);
  await expect(codex).toContainText('Login tidak selesai');
});

test('claude sign-in points to the official terminal command (no in-app token handling)', async ({ page }) => {
  scenario({ claude: { health: 'not_authenticated' } });
  await page.goto('/settings/ai-connections');
  const claude = card(page, 'claude');
  await claude.getByRole('button', { name: 'Periksa status' }).click();
  await claude.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(claude.getByText('claude auth login --claudeai')).toBeVisible();
  await expect(claude.getByTestId('login-code')).toHaveCount(0);
});

test('analysis: consent first (counts, fields, exact payload), then a labelled advisory result', async ({ page }) => {
  scenario({ claude: { health: 'connected', analysis: 'ok', model: 'fake-model-1' } });
  await review(page);
  const consent = page.getByTestId('consent');
  await expect(consent).toContainText('Data berikut akan dikirim ke Claude');
  await expect(consent).toContainText('3 episode · 3 distribusi · 2 snapshot');
  await expect(consent).toContainText('alias episode E1, E2');
  await expect(consent).toContainText('Tidak dikirim');
  await expect(consent).toContainText('naskah dan catatan');

  // The payload is minimized: aliases, not titles; unknown stays null (never 0).
  const payload = await consent.locator('pre').textContent();
  for (const title of ['Ai Satu', 'Ai Dua', 'Ai Tiga']) expect(payload).not.toContain(title);
  const body = JSON.parse(payload!) as { posts: { value: number | null; unavailableReason: string | null }[] };
  expect(body.posts.filter((p) => p.value === 0)).toHaveLength(1); // measured zero stays 0
  expect(body.posts.filter((p) => p.value === null && p.unavailableReason)).toHaveLength(1); // unknown stays null + reason

  // Nothing was sent yet: cancelling leaves no result.
  await page.getByRole('button', { name: 'Batal' }).click();
  await expect(page.getByTestId('consent')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tinjau data yang akan dikirim' }).click();
  await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
  const result = page.getByTestId('ai-result');
  await expect(result).toBeVisible();
  for (const heading of ['Temuan', 'Bukti', 'Keterbatasan', 'Hipotesis', 'Eksperimen berikutnya', 'Kriteria sukses']) {
    await expect(result.getByRole('heading', { level: 3, name: heading })).toBeVisible();
  }
  await expect(result).toContainText('Penyedia: Claude');
  await expect(result).toContainText('Model: fake-model-1');
  await expect(result).toContainText('Saran, bukan fakta');
  await expect(result.getByText('Legenda rujukan')).toBeVisible();
  await expect(result.getByRole('button', { name: 'Salin hasil analisis' })).toBeVisible();
  await expect(result).not.toContainText('Rujukan tidak dikenal');
});

test('analysis: titles are sent only when the user opts in', async ({ page }) => {
  scenario({ claude: { health: 'connected' } });
  await review(page, { titles: true });
  const payload = await page.getByTestId('consent').locator('pre').textContent();
  expect(payload).toContain('Ai Satu');
  await expect(page.getByTestId('consent')).toContainText('judul episode');
});

test('analysis: hostile output is shown as inert text', async ({ page }) => {
  scenario({ claude: { health: 'connected', analysis: 'html' } });
  let dialogs = 0;
  page.on('dialog', async (d) => {
    dialogs++;
    await d.dismiss();
  });
  await review(page);
  await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
  const result = page.getByTestId('ai-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('<script>alert(1)</script>');
  expect(await result.locator('script, a, img, iframe').count()).toBe(0);
  await expect(result).toContainText('[klik](javascript:alert(1))');
  expect(dialogs).toBe(0);
});

test('analysis: unknown references are flagged', async ({ page }) => {
  scenario({ claude: { health: 'connected', analysis: 'unknown-ref' } });
  await review(page);
  await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
  await expect(page.getByTestId('ai-result')).toContainText('Rujukan tidak dikenal');
  await expect(page.getByTestId('ai-result')).toContainText('E99');
});

test('analysis: malformed output is rejected and never rendered; provider errors show safe codes', async ({ page }) => {
  const cases: [string, RegExp][] = [
    ['invalid', /INVALID_RESPONSE/],
    ['AUTH_REQUIRED', /AUTH_REQUIRED/],
    ['RATE_LIMITED', /RATE_LIMITED/],
    ['TIMEOUT', /TIMEOUT/],
    ['NETWORK_UNAVAILABLE', /NETWORK_UNAVAILABLE/],
    ['TOOL_USE_BLOCKED', /TOOL_USE_BLOCKED/],
  ];
  for (const [analysis, code] of cases) {
    scenario({ claude: { health: 'connected', analysis } });
    await review(page);
    await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
    const error = page.getByTestId('ai-error');
    await expect(error, analysis).toBeVisible();
    await expect(error.getByTestId('ai-error-code')).toHaveText(code);
    await expect(error).toContainText('Kode operasi');
    await expect(page.getByTestId('ai-result')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Kembali ke analitik' })).toBeVisible();
  }
});

test('analysis: a running request can be cancelled, then the next one works', async ({ page }) => {
  scenario({ claude: { health: 'connected', analysis: 'slow' } });
  await review(page);
  await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Menganalisis dengan Claude' })).toBeVisible();
  await page.getByRole('button', { name: 'Batalkan analisis' }).click();
  await expect(page.getByTestId('consent')).toHaveCount(0);
  await expect(page.getByTestId('ai-result')).toHaveCount(0);

  scenario({ claude: { health: 'connected', analysis: 'ok' } });
  await page.getByRole('button', { name: 'Tinjau data yang akan dikirim' }).click();
  await page.getByRole('button', { name: 'Lanjutkan dan kirim' }).click();
  await expect(page.getByTestId('ai-result')).toBeVisible();
});

test('API guards: consent, validation, size cap, stale payload, and same-origin requirement', async ({ request }) => {
  scenario({ claude: { health: 'connected' } });
  const post = (url: string, data: unknown, headers: Record<string, string> = ORIGIN) =>
    request.post(url, { data, headers: { 'content-type': 'application/json', ...headers } });

  expect((await post('/api/ai/analyze', { provider: 'claude', filters: { tag: TAG } })).status()).toBe(400); // no consent
  expect((await post('/api/ai/analyze', { provider: 'claude', filters: { tag: TAG }, consent: true })).status()).toBe(400); // no payload hash
  expect((await post('/api/ai/preview', { provider: 'bogus', filters: {} })).status()).toBe(400);
  expect((await post('/api/ai/preview', { provider: 'claude', filters: { from: 'not-a-date' } })).status()).toBe(400);
  expect((await post('/api/ai/preview', { provider: 'claude', filters: { x: 'y'.repeat(5000) } })).status()).toBe(413);
  const stale = await post('/api/ai/analyze', { provider: 'claude', filters: { tag: TAG }, consent: true, payloadHash: '0123456789abcdef' });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('DATA_CHANGED');
  // Mutating request without a same-origin loopback Origin is refused by the proxy.
  expect((await post('/api/ai/preview', { provider: 'claude', filters: {} }, {})).status()).toBe(403);
  expect((await post('/api/ai/preview', { provider: 'claude', filters: {} }, { origin: 'https://evil.example' })).status()).toBe(403);
  // A valid preview works and is never cached.
  const ok = await post('/api/ai/preview', { provider: 'claude', filters: { tag: TAG } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()['cache-control']).toBe('no-store');
});

test('layout: AI pages do not overflow on narrow screens', async ({ page }) => {
  scenario({ claude: { health: 'connected' }, codex: { health: 'connected' } });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of ['/settings/ai-connections', AI_URL]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${url} overflows at ${width}px`).toBe(true);
    }
  }
  scenario(null);
});
