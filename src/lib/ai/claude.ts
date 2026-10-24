import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_PROMPT } from './analysis';
import { AI_ERROR_INFO, AiError, classifyFailure, newOperationId, type AiErrorCode } from './errors';
import { buildChildEnv } from './env';
import { resolveProviderCommand, type ResolvedCommand } from './executable';
import { withProviderGuard } from './guard';
import { removeDir } from './fsutil';
import { runBounded } from './process';
import type { AnalysisRequest, AnalysisResult, LocalAiProvider, ProviderHealth, RunOptions } from './types';

export interface ClaudeOptions {
  resolve?: () => ResolvedCommand | null;
  env?: NodeJS.ProcessEnv;
  analysisTimeoutMs?: number;
}

const MAX_STDOUT = 2 * 1024 * 1024;
const MAX_STDERR = 64 * 1024;

/**
 * Claude via the OFFICIAL Claude Code CLI in print mode.
 *  - Auth is owned by the CLI (`claude auth login` in the user's terminal). We never read credentials.
 *  - `--tools ""` disables every tool: analytics prompts get no file-system, terminal, web or MCP tools.
 *  - `--bare` is NOT used: per the CLI help it restricts auth to ANTHROPIC_API_KEY (API billing), which would
 *    silently abandon the user's subscription. We also never forward ANTHROPIC_API_KEY (see env.ts).
 *  - The prompt goes through stdin (no argument-length or quoting issues); cwd is an empty temp directory so no
 *    project instructions are picked up; sessions are not persisted.
 */
export class ClaudeProvider implements LocalAiProvider {
  readonly id = 'claude' as const;
  private readonly resolve: () => ResolvedCommand | null;
  private readonly env: NodeJS.ProcessEnv;
  private readonly analysisTimeoutMs: number;

  constructor(options: ClaudeOptions = {}) {
    this.resolve = options.resolve ?? (() => resolveProviderCommand('claude'));
    this.env = options.env ?? process.env;
    this.analysisTimeoutMs = options.analysisTimeoutMs ?? 120_000;
  }

  private async run(args: string[], input: string | undefined, timeoutMs: number, signal?: AbortSignal) {
    const cmd = this.resolve();
    if (!cmd) throw new AiError('CLI_NOT_FOUND');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-claude-'));
    try {
      return await runBounded({
        spec: { command: cmd.command, args: [...cmd.prefixArgs, ...args], cwd, env: buildChildEnv(this.env) },
        input,
        timeoutMs,
        maxStdoutBytes: MAX_STDOUT,
        maxStderrBytes: MAX_STDERR,
        signal,
      });
    } finally {
      await removeDir(cwd);
    }
  }

  async checkHealth(options: RunOptions = {}): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    const base = { provider: 'claude' as const, checkedAt, installed: false, authenticated: null as boolean | null };
    try {
      const v = await this.run(['--version'], undefined, 15_000, options.signal);
      if (v.spawnFailed || v.exitCode !== 0 || v.timedOut) {
        const code: AiErrorCode = v.spawnFailed || v.exitCode === null ? 'CLI_NOT_FOUND' : 'PROVIDER_ERROR';
        return { ...base, status: v.spawnFailed ? 'not_installed' : 'error', displayMessage: AI_ERROR_INFO[code].message, remediation: AI_ERROR_INFO[code].remediation, errorCode: code };
      }
      const version = /(\d+\.\d+\.\d+[\w.+-]*)/.exec(v.stdout)?.[1];
      const auth = await this.run(['auth', 'status', '--json'], undefined, 20_000, options.signal);
      const parsed = parseAuthStatus(auth.stdout);
      if (parsed.loggedIn === false) {
        return { ...base, installed: true, version, authenticated: false, status: 'not_authenticated', displayMessage: AI_ERROR_INFO.AUTH_REQUIRED.message, remediation: AI_ERROR_INFO.AUTH_REQUIRED.remediation, errorCode: 'AUTH_REQUIRED' };
      }
      if (parsed.loggedIn === null) {
        return {
          ...base, installed: true, version, authenticated: null, status: 'unavailable',
          displayMessage: 'CLI terpasang, tetapi status login tidak terbaca.',
          remediation: 'Jalankan “Uji koneksi” untuk memastikan; atau masuk lewat terminal dengan perintah login resmi.',
        };
      }
      return {
        ...base, installed: true, version, authenticated: true, planLabel: parsed.plan, apiBilling: parsed.apiBilling,
        status: 'connected',
        displayMessage: parsed.apiBilling
          ? 'Masuk, tetapi CLI memakai penagihan API/Console, bukan langganan Claude Anda.'
          : 'CLI terpasang dan sudah masuk. Jalankan “Uji koneksi” untuk membuktikan permintaan berhasil.',
        remediation: parsed.apiBilling ? 'Jika ingin memakai langganan: jalankan `claude auth login --claudeai` di terminal.' : undefined,
      };
    } catch (error) {
      if (error instanceof AiError) {
        const status = error.code === 'CLI_NOT_FOUND' ? 'not_installed' : error.code === 'RATE_LIMITED' ? 'rate_limited' : 'error';
        return { ...base, status, displayMessage: error.message, remediation: error.remediation, errorCode: error.code };
      }
      throw error;
    }
  }

  async testInference(options: RunOptions = {}): Promise<void> {
    const result = await this.ask({ prompt: TEST_PROMPT, maxOutputChars: 2000 }, options, 45_000);
    if (!result.text.trim()) throw new AiError('INVALID_RESPONSE');
  }

  analyze(request: AnalysisRequest, options: RunOptions = {}): Promise<AnalysisResult> {
    return this.ask(request, options, this.analysisTimeoutMs);
  }

  private async ask(request: AnalysisRequest, options: RunOptions, timeoutMs: number): Promise<AnalysisResult> {
    return withProviderGuard('claude', async () => {
      const operationId = newOperationId();
      const started = Date.now();
      const res = await this.run(
        ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--disable-slash-commands'],
        request.prompt,
        timeoutMs,
        options.signal,
      );
      if (res.aborted) throw new AiError('CANCELLED', operationId);
      if (res.timedOut) throw new AiError('TIMEOUT', operationId);
      if (res.spawnFailed) throw new AiError('CLI_NOT_FOUND', operationId);
      if (res.truncated) throw new AiError('INVALID_RESPONSE', operationId);

      let body: unknown;
      try {
        body = JSON.parse(res.stdout);
      } catch {
        // No JSON at all: classify the failure from stderr/stdout text without ever surfacing it.
        throw new AiError(res.exitCode === 0 ? 'INVALID_RESPONSE' : classifyFailure(`${res.stderr}\n${res.stdout}`), operationId);
      }
      const obj = (Array.isArray(body) ? body.find((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'result') : body) as
        | { result?: unknown; is_error?: unknown; subtype?: unknown; model?: unknown }
        | undefined;
      if (!obj || typeof obj !== 'object') throw new AiError('INVALID_RESPONSE', operationId);

      const text = typeof obj.result === 'string' ? obj.result : '';
      if (obj.is_error === true || res.exitCode !== 0) {
        throw new AiError(classifyFailure(`${text}\n${res.stderr}`), operationId);
      }
      if (!text) throw new AiError('INVALID_RESPONSE', operationId);
      if (text.length > request.maxOutputChars) throw new AiError('INVALID_RESPONSE', operationId);
      return {
        provider: 'claude',
        text,
        model: typeof obj.model === 'string' ? obj.model.slice(0, 80) : null,
        durationMs: Date.now() - started,
      };
    });
  }
}

/** Tolerant reader for `claude auth status --json`: only login state, plan label and API-billing hint are used. */
export function parseAuthStatus(stdout: string): { loggedIn: boolean | null; plan?: string; apiBilling: boolean } {
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { loggedIn: null, apiBilling: false };
    obj = parsed as Record<string, unknown>;
  } catch {
    return { loggedIn: null, apiBilling: false };
  }
  const flag = ['loggedIn', 'logged_in', 'isLoggedIn'].map((k) => obj[k]).find((v) => typeof v === 'boolean') as boolean | undefined;
  const plan = ['subscriptionType', 'plan', 'planType'].map((k) => obj[k]).find((v) => typeof v === 'string') as string | undefined;
  const method = ['authMethod', 'auth_method', 'method'].map((k) => obj[k]).find((v) => typeof v === 'string') as string | undefined;
  return {
    loggedIn: flag ?? null,
    plan: plan && plan.length <= 40 ? plan : undefined,
    apiBilling: Boolean(method && /(api|console)/i.test(method)),
  };
}
