import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDist, snap, testDb } from '@/test/helpers';
import { parseAiRequest } from '@/lib/http/ai-request';
import { DEFAULT_QUERY, type AnalyticsQuery } from './analytics';
import { previewAnalysis, runAnalysis } from './ai';

// The in-process fake provider reads its scenario from <data dir>/fake-ai.json.
let dir: string;
const scenario = (value: object) => fs.writeFileSync(path.join(dir, 'fake-ai.json'), JSON.stringify(value));
const query = (extra: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({ ...DEFAULT_QUERY, metricId: 'mdef_views', windowHours: 24, ...extra });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ai-svc-'));
  process.env.SIGNALFORGE_AI_MODE = 'fake';
  process.env.SIGNALFORGE_DATA_DIR = dir;
});
afterAll(() => {
  delete process.env.SIGNALFORGE_AI_MODE;
  delete process.env.SIGNALFORGE_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => scenario({ claude: { health: 'connected' } }));

function seeded() {
  const db = testDb();
  const a = addDist(db, 'Judul Alfa', 'youtube', '2026-10-01T10:00');
  snap(db, a.distributionId, '2026-10-02T10:00', { mdef_views: '900' });
  return db;
}

describe('previewAnalysis', () => {
  it('describes what would be sent and fingerprints the exact payload', () => {
    const p = previewAnalysis(seeded(), { provider: 'claude', query: query(), includeTitles: false });
    if ('empty' in p) throw new Error('expected a preview');
    expect(p.consent.provider).toBe('Claude');
    expect(p.consent.counts).toMatchObject({ episodes: 1, distributions: 1, snapshots: 1 });
    expect(p.payloadHash).toMatch(/^[0-9a-f]{16}$/);
    expect(p.payloadJson).not.toContain('Judul Alfa');
    expect(p.subset.windowHours).toBe(24);
  });

  it('refuses to build anything when there is nothing comparable to analyze', () => {
    const empty = previewAnalysis(testDb(), { provider: 'claude', query: query(), includeTitles: false });
    expect(empty).toHaveProperty('empty');
    const db = testDb();
    addDist(db, 'Tanpa snapshot', 'youtube', '2026-10-01T10:00');
    expect(previewAnalysis(db, { provider: 'claude', query: query(), includeTitles: false })).toHaveProperty('empty', expect.stringMatching(/sebanding/));
  });
});

describe('runAnalysis', () => {
  const input = (db: ReturnType<typeof testDb>, titles = false) => {
    const p = previewAnalysis(db, { provider: 'claude', query: query(), includeTitles: titles });
    if ('empty' in p) throw new Error('expected a preview');
    return { provider: 'claude' as const, query: query(), includeTitles: titles, expectedHash: p.payloadHash };
  };

  it('returns the validated six sections with a legend resolved locally', async () => {
    const db = seeded();
    const out = await runAnalysis(db, input(db));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.sections)).toHaveLength(6);
    expect(out.providerName).toBe('Claude');
    expect(out.model).toBe('fake-model-1');
    expect(out.unknownRefs).toEqual([]);
    expect(out.legend.find((l) => l.alias === 'E1')?.label).toBe('Judul Alfa'); // titles stay local
  });

  it('refuses when the data changed after the user reviewed the payload', async () => {
    const db = seeded();
    const reviewed = input(db);
    const b = addDist(db, 'Baru', 'youtube', '2026-10-02T10:00');
    snap(db, b.distributionId, '2026-10-03T10:00', { mdef_views: '5' });
    const out = await runAnalysis(db, reviewed);
    expect(out).toMatchObject({ ok: false, code: 'DATA_CHANGED' });
  });

  it('rejects malformed output and reports provider failures as safe codes only', async () => {
    const db = seeded();
    scenario({ claude: { health: 'connected', analysis: 'invalid' } });
    expect(await runAnalysis(db, input(db))).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' });
    scenario({ claude: { health: 'connected', analysis: 'RATE_LIMITED' } });
    const limited = await runAnalysis(db, input(db));
    expect(limited).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(JSON.stringify(limited)).not.toMatch(/stack|Error:|at .*\.ts/);
  });

  it('flags citations that are not in the data that was sent', async () => {
    const db = seeded();
    scenario({ claude: { health: 'connected', analysis: 'unknown-ref' } });
    const out = await runAnalysis(db, input(db));
    expect(out.ok && out.unknownRefs).toEqual(['E99']);
  });

  it('stops when the caller aborts', async () => {
    const db = seeded();
    scenario({ claude: { health: 'connected', analysis: 'slow' } });
    const controller = new AbortController();
    const pending = runAnalysis(db, { ...input(db), signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    expect(await pending).toMatchObject({ ok: false, code: 'CANCELLED' });
  });
});

describe('parseAiRequest', () => {
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://127.0.0.1:3000/api/ai/preview', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });

  it('accepts a minimal valid body and sanitises filters', async () => {
    const r = await parseAiRequest(req({ provider: 'codex', filters: { metric: 'mdef_views', window: '24', tag: 'x' } }));
    expect(r).toMatchObject({ ok: true, input: { provider: 'codex', includeTitles: false }, consent: false, payloadHash: null });
    if (r.ok) expect(r.input.query).toMatchObject({ metricId: 'mdef_views', windowHours: 24, tag: 'x' });
  });

  it.each([
    ['not json', 400],
    [{ provider: 'gpt', filters: {} }, 400],
    [{ provider: 'claude', filters: { from: '2026-13-45' } }, 400],
    [{ provider: 'claude', payloadHash: 'XYZ' }, 400],
    [{ provider: 'claude', filters: { k: 'x'.repeat(5000) } }, 413],
  ])('rejects %j with %i', async (body, status) => {
    expect(await parseAiRequest(req(body))).toMatchObject({ ok: false, status });
  });
});
