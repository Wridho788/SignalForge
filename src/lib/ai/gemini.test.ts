import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetGuardForTests } from './guard';
import { GEMINI_FREE_MODEL, GeminiProvider } from './gemini';
import { FakeProvider } from './fake';

const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });

beforeEach(() => resetGuardForTests());

describe('Gemini free tier adapter', () => {
  it('keeps the model fixed and sends the reviewed prompt server-side with a bounded output', async () => {
    const calls: { url: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push({ url, init });
      return reply('result');
    };
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: 'test-secret' }, fetch: fetcher });
    const result = await provider.analyze({ prompt: 'reviewed prompt', maxOutputChars: 6000 });

    expect(result).toMatchObject({ provider: 'gemini', model: GEMINI_FREE_MODEL, text: 'result' });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toContain(`models/${GEMINI_FREE_MODEL}:generateContent`);
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-secret');
    expect(init?.body).toContain('reviewed prompt');
    expect(JSON.parse(String(init?.body)).generationConfig.maxOutputTokens).toBe(2000);
    expect(init?.cache).toBe('no-store');
  });

  it('reports a missing key without making a network request', async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return reply('unexpected'); };
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: '' }, fetch: fetcher });
    const health = await provider.checkHealth();
    expect(health).toMatchObject({ status: 'not_authenticated', authenticated: false, errorCode: 'AUTH_REQUIRED' });
    await expect(provider.testInference()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(calls).toBe(0);
  });

  it('maps quota failures without exposing Google response text', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ error: { message: 'sensitive provider detail' } }), { status: 429 });
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: 'test-secret' }, fetch: fetcher });
    await expect(provider.analyze({ prompt: 'x', maxOutputChars: 100 })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rejects an answer longer than the caller limit', async () => {
    const fetcher: typeof fetch = async () => reply('too long');
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: 'test-secret' }, fetch: fetcher });
    await expect(provider.analyze({ prompt: 'x', maxOutputChars: 3 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('drops thinking parts so private reasoning never reaches the answer', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: 'internal reasoning that must not surface', thought: true },
                  { text: 'visible answer' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: 'test-secret' }, fetch: fetcher });
    const result = await provider.analyze({ prompt: 'x', maxOutputChars: 500 });
    expect(result.text).toBe('visible answer');
  });

  it('rejects a truncated answer instead of returning a partial one', async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '## Findings\npartial' }] } }],
        }),
        { status: 200 },
      );
    const provider = new GeminiProvider({ env: { ...process.env, GEMINI_API_KEY: 'test-secret' }, fetch: fetcher });
    await expect(provider.analyze({ prompt: 'x', maxOutputChars: 500 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('Gemini fake provider wording', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-gemini-fake-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not describe a missing key as a missing CLI', async () => {
    fs.writeFileSync(path.join(dir, 'fake-ai.json'), JSON.stringify({ gemini: { health: 'not_installed' } }));
    const health = await new FakeProvider('gemini', () => dir).checkHealth();
    expect(health.status).toBe('not_installed');
    expect(health.displayMessage).not.toContain('CLI');
    expect(health.remediation).toContain('GEMINI_API_KEY');
    expect(health.errorCode).toBe('AUTH_REQUIRED');
  });

  it('describes a missing key as needing one when the scenario says not authenticated', async () => {
    fs.writeFileSync(path.join(dir, 'fake-ai.json'), JSON.stringify({ gemini: { health: 'not_authenticated' } }));
    const health = await new FakeProvider('gemini', () => dir).checkHealth();
    expect(health.status).toBe('not_authenticated');
    expect(health.displayMessage).not.toContain('CLI');
    expect(health.remediation).toContain('GEMINI_API_KEY');
  });
});
