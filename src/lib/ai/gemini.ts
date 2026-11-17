import { AiError, newOperationId } from './errors';
import { withProviderGuard } from './guard';
import type { AnalysisRequest, AnalysisResult, LocalAiProvider, ProviderHealth, RunOptions } from './types';

/** The API model is fixed to a model listed in Google's Gemini API free tier. No user input can select a model. */
export const GEMINI_FREE_MODEL = 'gemini-3.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 4096;
const MAX_RESPONSE_BYTES = 64 * 1024;

async function readBoundedBody(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES || !response.body) throw new AiError('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AiError('INVALID_RESPONSE');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export interface GeminiOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Direct server-side Gemini Developer API adapter. The key is read from process env and never serialized to UI. */
export class GeminiProvider implements LocalAiProvider {
  readonly id = 'gemini' as const;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GeminiOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async checkHealth(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.env.GEMINI_API_KEY?.trim()) {
      return {
        provider: this.id,
        checkedAt,
        installed: true,
        authenticated: false,
        status: 'not_authenticated',
        displayMessage: 'GEMINI_API_KEY belum tersedia pada environment server.',
        remediation: 'Ikuti panel “Cara menyiapkan” untuk membuat key Free Tier dan memasangnya sebagai environment variable OS. SignalForge tidak menyimpan atau menampilkan key.',
        errorCode: 'AUTH_REQUIRED',
      };
    }
    return {
      provider: this.id,
      checkedAt,
      installed: true,
      authenticated: null,
      status: 'connected',
      displayMessage: 'Key Gemini ditemukan pada environment server. Keabsahan key dan kuota baru dipastikan saat permintaan uji atau analisis.',
    };
  }

  testInference(options: RunOptions = {}): Promise<void> {
    return this.generate('Balas hanya dengan kata OK.', 40, options).then(() => undefined);
  }

  analyze(request: AnalysisRequest, options: RunOptions = {}): Promise<AnalysisResult> {
    return this.generate(request.prompt, request.maxOutputChars, options);
  }

  private async generate(prompt: string, maxOutputChars: number, options: RunOptions): Promise<AnalysisResult> {
    return withProviderGuard(this.id, async () => {
      const apiKey = this.env.GEMINI_API_KEY?.trim();
      if (!apiKey) throw new AiError('AUTH_REQUIRED');

      const operationId = newOperationId();
      const started = Date.now();
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await this.fetcher(API_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { candidateCount: 1, maxOutputTokens: Math.min(MAX_OUTPUT_TOKENS, Math.ceil(maxOutputChars / 3)), temperature: 0.2 },
          }),
          signal,
          cache: 'no-store',
        });
      } catch {
        if (options.signal?.aborted) throw new AiError('CANCELLED', operationId);
        if (timeout.aborted) throw new AiError('TIMEOUT', operationId);
        throw new AiError('NETWORK_UNAVAILABLE', operationId);
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const code = response.status === 401 || response.status === 403
          ? 'AUTH_REQUIRED'
          : response.status === 429
            ? 'RATE_LIMITED'
            : response.status === 408
              ? 'TIMEOUT'
              : response.status >= 500
                ? 'NETWORK_UNAVAILABLE'
                : 'PROVIDER_ERROR';
        throw new AiError(code, operationId);
      }

      let body: unknown;
      try {
        body = JSON.parse(await readBoundedBody(response)) as unknown;
      } catch {
        if (options.signal?.aborted) throw new AiError('CANCELLED', operationId);
        if (timeout.aborted) throw new AiError('TIMEOUT', operationId);
        throw new AiError('INVALID_RESPONSE', operationId);
      }
      const root = body && typeof body === 'object' ? body as Record<string, unknown> : null;
      const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
      const candidate = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] as Record<string, unknown> : null;
      const content = candidate?.content && typeof candidate.content === 'object' ? candidate.content as Record<string, unknown> : null;
      const parts = Array.isArray(content?.parts) ? content.parts : [];
      // Thinking parts (part.thought === true) are the model's private reasoning. They are never part of the answer
      // and must not reach the user, so they are dropped rather than concatenated.
      const text = parts
        .filter((part): part is Record<string, unknown> => Boolean(part && typeof part === 'object'))
        .filter((part) => part.thought !== true)
        .map((part) => typeof part.text === 'string' ? part.text : '')
        .join('');
      // Only a complete, stopped answer is usable. SAFETY, MAX_TOKENS, RECITATION and any other stop reason mean
      // the answer is absent, blocked or cut off mid-way; a partial answer would fail section validation anyway,
      // but rejecting it here keeps the failure explicit and provider text never reaches the UI.
      const finishReason = candidate?.finishReason;
      if (!text || text.length > maxOutputChars || (typeof finishReason === 'string' && finishReason !== 'STOP')) {
        throw new AiError('INVALID_RESPONSE', operationId);
      }

      return { provider: this.id, text, model: GEMINI_FREE_MODEL, durationMs: Date.now() - started };
    });
  }
}
