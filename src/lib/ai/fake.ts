import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { SECTIONS } from './analysis';
import { AI_ERROR_INFO, AiError, type AiErrorCode } from './errors';
import type { AnalysisRequest, AnalysisResult, LocalAiProvider, LoginInfo, LoginState, ProviderHealth, ProviderId, RunOptions } from './types';

/**
 * Deterministic in-process provider for end-to-end tests and demos (`SIGNALFORGE_AI_MODE=fake`).
 * It never spawns a process, never touches a network and never sees a credential. The scenario is read from
 * `<data dir>/fake-ai.json` on every call so a test can change behaviour without restarting the server.
 * With no file, every provider is "not installed" — the same disconnected state a fresh machine has.
 */
const ERROR_CODES = Object.keys(AI_ERROR_INFO) as AiErrorCode[];

const scenarioSchema = z.object({
  health: z.enum(['connected', 'not_installed', 'not_authenticated', 'rate_limited', 'error']).default('not_installed'),
  inference: z.union([z.literal('ok'), z.enum(ERROR_CODES as [AiErrorCode, ...AiErrorCode[]])]).default('ok'),
  analysis: z
    .union([z.enum(['ok', 'invalid', 'unknown-ref', 'html', 'slow']), z.enum(ERROR_CODES as [AiErrorCode, ...AiErrorCode[]])])
    .default('ok'),
  model: z.string().max(80).default('fake-model-1'),
  loginMs: z.number().int().min(0).max(60_000).default(300),
});
type Scenario = z.infer<typeof scenarioSchema>;
type AnswerKind = 'ok' | 'invalid' | 'unknown-ref' | 'html' | 'slow';
const isAnswerKind = (v: string): v is AnswerKind => ['ok', 'invalid', 'unknown-ref', 'html', 'slow'].includes(v);
const fileSchema = z.object({ claude: scenarioSchema.partial().optional(), codex: scenarioSchema.partial().optional() });

export class FakeProvider implements LocalAiProvider {
  protected signedIn = false;

  constructor(
    readonly id: ProviderId,
    private readonly dataDir: () => string,
  ) {}

  protected scenario(): Scenario {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.dataDir(), 'fake-ai.json'), 'utf8')) as unknown;
      const parsed = fileSchema.safeParse(raw);
      if (parsed.success) return scenarioSchema.parse(parsed.data[this.id] ?? {});
    } catch {
      // no file / unreadable → default scenario
    }
    return scenarioSchema.parse({});
  }

  async checkHealth(): Promise<ProviderHealth> {
    const s = this.scenario();
    const base = { provider: this.id, checkedAt: new Date().toISOString(), installed: s.health !== 'not_installed', authenticated: null as boolean | null };
    const health = this.signedIn && s.health === 'not_authenticated' ? 'connected' : s.health;
    switch (health) {
      case 'not_installed':
        return { ...base, status: 'not_installed', displayMessage: AI_ERROR_INFO.CLI_NOT_FOUND.message, remediation: AI_ERROR_INFO.CLI_NOT_FOUND.remediation, errorCode: 'CLI_NOT_FOUND' };
      case 'not_authenticated':
        return { ...base, installed: true, authenticated: false, status: 'not_authenticated', displayMessage: AI_ERROR_INFO.AUTH_REQUIRED.message, remediation: AI_ERROR_INFO.AUTH_REQUIRED.remediation, errorCode: 'AUTH_REQUIRED' };
      case 'rate_limited':
        return { ...base, installed: true, authenticated: true, status: 'rate_limited', displayMessage: AI_ERROR_INFO.RATE_LIMITED.message, remediation: AI_ERROR_INFO.RATE_LIMITED.remediation, errorCode: 'RATE_LIMITED' };
      case 'error':
        return { ...base, installed: true, status: 'error', displayMessage: AI_ERROR_INFO.PROVIDER_ERROR.message, remediation: AI_ERROR_INFO.PROVIDER_ERROR.remediation, errorCode: 'PROVIDER_ERROR' };
      default:
        return {
          ...base, installed: true, authenticated: true, version: '0.0.0-fake', status: 'connected',
          displayMessage: 'CLI uji terpasang dan sudah masuk. Jalankan “Uji koneksi” untuk membuktikan permintaan berhasil.',
        };
    }
  }

  async testInference(options: RunOptions = {}): Promise<void> {
    const s = this.scenario();
    await this.wait(150, options.signal);
    if (s.inference !== 'ok') throw new AiError(s.inference);
  }

  async analyze(request: AnalysisRequest, options: RunOptions = {}): Promise<AnalysisResult> {
    const s = this.scenario();
    const started = Date.now();
    if (s.analysis === 'slow') await this.wait(30_000, options.signal);
    else await this.wait(200, options.signal);
    if (!isAnswerKind(s.analysis)) throw new AiError(s.analysis);
    return { provider: this.id, text: this.answer(request.prompt, s.analysis), model: s.model, durationMs: Date.now() - started };
  }

  private answer(prompt: string, kind: AnswerKind): string {
    if (kind === 'invalid') return 'Ini hanya paragraf bebas tanpa struktur yang diminta.';
    const data = /<data>\n([\s\S]*)\n<\/data>/.exec(prompt)?.[1] ?? '{}';
    let episode = 'E1';
    let snapshot = 'S1';
    try {
      const posts = (JSON.parse(data) as { posts?: { episode?: string; snapshot?: string | null }[] }).posts ?? [];
      episode = posts[0]?.episode ?? episode;
      snapshot = posts.find((p) => p.snapshot)?.snapshot ?? snapshot;
    } catch {
      // keep defaults
    }
    const cite = kind === 'unknown-ref' ? 'E99' : episode;
    const hostile = kind === 'html' ? ' <script>alert(1)</script> [klik](javascript:alert(1)) ![x](http://example.invalid/t.png)' : '';
    const body: Record<(typeof SECTIONS)[number], string> = {
      Findings: `- Data uji: ${cite} memiliki nilai pada usia setara (${snapshot}).${hostile}\n- Ini keluaran **uji** dari penyedia palsu.`,
      Evidence: `Merujuk ${cite} dan ${snapshot}. Jumlah sampel kecil.`,
      Limitations: 'Data observasional; tidak ada klaim sebab-akibat. Nilai yang tidak diketahui tidak dihitung sebagai 0.',
      Hypotheses: '1. Judul yang lebih spesifik *mungkin* berkaitan dengan nilai lebih tinggi (hipotesis).',
      'Next Experiment': 'Uji satu variabel: judul A vs B pada platform yang sama dengan jendela 24 jam.',
      'Success Criteria': 'Metrik utama naik minimal 10% relatif terhadap baseline pada usia setara.',
    };
    return SECTIONS.map((name) => `## ${name}\n${body[name]}`).join('\n\n');
  }

  private wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new AiError('CANCELLED'));
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AiError('CANCELLED'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

}

/** Codex signs in through the app-server's device-code flow; Claude has no in-app sign-in (a terminal command), so only this subclass has one. */
export class FakeCodexProvider extends FakeProvider {
  private login: LoginState = { state: 'idle' };
  private loginTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: () => string) {
    super('codex', dataDir);
  }

  async startLogin(): Promise<LoginInfo> {
    const info: LoginInfo = { provider: this.id, verificationUrl: 'https://chatgpt.com/device', userCode: 'FAKE-1234', startedAt: new Date().toISOString() };
    this.login = { state: 'pending', info };
    this.loginTimer = setTimeout(() => {
      this.signedIn = true;
      this.login = { state: 'completed', at: new Date().toISOString() };
    }, this.scenario().loginMs);
    return info;
  }

  async cancelLogin(): Promise<void> {
    if (this.loginTimer) clearTimeout(this.loginTimer);
    this.loginTimer = null;
    if (this.login.state === 'pending') this.login = { state: 'failed', at: new Date().toISOString(), code: 'CANCELLED' };
  }

  loginState(): LoginState {
    return this.login;
  }
}
