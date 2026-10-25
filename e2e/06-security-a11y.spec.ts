import { expect, test, type Page } from '@playwright/test';
import { addDistribution, createEpisode, fillSnapshot } from './helpers';

test.describe.configure({ mode: 'serial' });

let episodeId = '';
let distributionUrl = '';

test.describe('request guard (loopback Host/Origin)', () => {
  test('rejects a non-loopback Host header (DNS rebinding)', async ({ request }) => {
    const res = await request.get('/', { headers: { host: 'rebind.evil.example:3100' } });
    expect(res.status()).toBe(403);
  });

  test('rejects state-changing requests without a same-origin Origin', async ({ request }) => {
    const none = await request.post('/episodes/new', { data: 'x' });
    expect(none.status()).toBe(403);
    const cross = await request.post('/episodes/new', { data: 'x', headers: { origin: 'https://evil.example' } });
    expect(cross.status()).toBe(403);
    const otherPort = await request.post('/episodes/new', { data: 'x', headers: { origin: 'http://127.0.0.1:4000' } });
    expect(otherPort.status()).toBe(403);
  });

  test('still serves normal loopback GETs', async ({ request }) => {
    expect((await request.get('/api/health')).status()).toBe(200);
  });
});

test.describe('data for UI checks', () => {
  test('seed an episode with a snapshot through the UI', async ({ page }) => {
    episodeId = await createEpisode(page, 'Episode Uji Aksesibilitas');
    await addDistribution(page, episodeId, { platform: 'facebook', publishedAt: '2026-10-01T10:00' });
    await page.waitForURL(/\/distributions\/[0-9a-f-]{36}(\?|$)/); // wait for the redirect before reading the URL
    distributionUrl = page.url().split('?')[0]!;
    await page.getByRole('link', { name: 'Tambah snapshot pertama' }).click();
    await fillSnapshot(page, { capturedAt: '2026-10-02T10:00', values: { mdef_views: '2500' } });
    await page.getByRole('button', { name: 'Simpan snapshot' }).click();
    await expect(page.getByText('Snapshot disimpan.')).toBeVisible();
  });
});

test.describe('keyboard and focus', () => {
  test('skip link is the first tab stop and moves focus to main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Lewati ke konten utama' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('focus indicator is visible on links and buttons', async ({ page }) => {
    await page.goto('/episodes');
    await page.getByRole('link', { name: 'Episode baru' }).focus();
    const outline = await page.getByRole('link', { name: 'Episode baru' }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('the sidebar and the episode form can be driven by keyboard alone', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Episode', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Episode' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Episode', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Episode baru' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#title').focus();
    await page.keyboard.type('Dibuat dengan keyboard');
    await page.keyboard.press('Enter'); // implicit submit from the text field
    await expect(page.getByRole('heading', { level: 1, name: 'Dibuat dengan keyboard' })).toBeVisible();
  });

  test('scrollable table regions are keyboard focusable and named', async ({ page }) => {
    await page.goto(distributionUrl);
    const region = page.locator('div[role="region"][tabindex="0"]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('aria-label', /Timeline snapshot/);
    await region.focus();
    await expect(region).toBeFocused();
  });
});

test.describe('semantics', () => {
  test('every form control on the main forms has an accessible name', async ({ page }) => {
    for (const url of ['/episodes/new', `/episodes/${episodeId}/distributions/new`, `${distributionUrl}/snapshots/new`, '/settings', '/settings/metrics/new']) {
      await page.goto(url);
      const unnamed = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')];
        return controls
          .filter((el) => {
            const input = el as HTMLInputElement;
            const hasLabel = input.labels && input.labels.length > 0;
            return !hasLabel && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
          })
          .map((el) => el.id || el.getAttribute('name') || el.tagName);
      });
      expect(unnamed, `unlabelled controls on ${url}`).toEqual([]);
    }
  });

  test('there is no token/secret/password input anywhere in the app UI', async ({ page }) => {
    for (const url of ['/', '/episodes', '/episodes/new', '/settings', '/settings/metrics', '/settings/ai-connections', '/analytics/ai', `${distributionUrl}/snapshots/new`]) {
      await page.goto(url);
      const bad = await page.evaluate(
        () =>
          [...document.querySelectorAll('input, textarea')].filter((el) => {
            const hay = `${el.getAttribute('name')} ${el.id} ${el.getAttribute('type')} ${el.getAttribute('autocomplete')}`.toLowerCase();
            return /token|secret|password|api[-_]?key|credential/.test(hay);
          }).length,
      );
      expect(bad, `credential-like input on ${url}`).toBe(0);
    }
  });

  test('tables have captions and column headers', async ({ page }) => {
    await page.goto(distributionUrl);
    await expect(page.locator('table caption')).toHaveCount(1);
    expect(await page.locator('table th[scope="col"]').count()).toBeGreaterThan(3);
  });
});

test.describe('responsive layout (no page-level horizontal overflow)', () => {
  const widths = [360, 768, 1280];
  const noOverflow = async (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  for (const width of widths) {
    test(`key pages fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const urls = ['/', '/episodes', `/episodes/${episodeId}`, distributionUrl, `${distributionUrl}/snapshots/new`, '/settings', '/settings/metrics'];
      for (const url of urls) {
        await page.goto(url);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await noOverflow(page), `${url} overflows horizontally at ${width}px`).toBe(true);
      }
    });
  }

  test('the wide timeline table scrolls inside its own region at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(distributionUrl);
    const scrolls = await page
      .locator('div[role="region"][tabindex="0"]')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
  });
});
