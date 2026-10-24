import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_VERSION } from '../identity';
import { TEST_PROMPT } from './analysis';
import { AI_ERROR_INFO, AiError, classifyFailure, newOperationId, type AiErrorCode } from './errors';
import { buildChildEnv } from './env';
import { resolveProviderCommand, type ResolvedCommand } from './executable';
import { withProviderGuard } from './guard';
import { removeDir } from './fsutil';
import { JsonRpcClient, rpcFailureText } from './jsonrpc';
import { runBounded, spawnChild } from './process';
import type { AnalysisRequest, AnalysisResult, LocalAiProvider, LoginInfo, LoginState, ProviderHealth, RunOptions } from './types';

export interface CodexOptions {
  resolve?: () => ResolvedCommand | null;
  env?: NodeJS.ProcessEnv;
  analysisTimeoutMs?: number;
  loginTimeoutMs?: number;
}

/** Thread items that mean the model tried to act on the machine or the web. Analytics prompts get none of these. */
const BLOCKED_ITEM_TYPES = new Set([
  'commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall', 'subAgentActivity',
  'webSearch', 'imageView', 'imageGeneration',
]);

const LOGIN_HOSTS = /(^|\.)(openai\.com|chatgpt\.com)$/i;

interface Session {
  client: JsonRpcClient;
  /** Set by the caller before requests that stream notifications. */
  onNotification: (method: string, params: unknown) => void;
  onServerRequest: (method: string) => void;
  onClose: (error: AiError) => void;
  close: () => Promise<void>;
}

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

export function mapCodexError(message: string, info: unknown): AiErrorCode {
  const label = typeof info === 'string' ? info : info && typeof info === 'object' ? (Object.keys(info as object)[0] ?? '') : '';
  if (label === 'unauthorized') return 'AUTH_REQUIRED';
  if (['usageLimitExceeded', 'rateLimitExceeded', 'serverOverloaded', 'sessionBudgetExceeded'].includes(label)) return 'RATE_LIMITED';
  if (['httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts'].includes(label)) {
    return 'NETWORK_UNAVAILABLE';
  }
  return classifyFailure(`${label} ${message}`);
}

/**
 * Codex via the OFFICIAL app-server (JSON-RPC over stdio), spawned with a fixed argument list and no shell.
 *  - Sign-in is Codex's own managed device-code login (`account/login/start`); credentials stay with Codex.
 *    We never use `--with-api-key` / `--with-access-token` or the token-sharing path: SignalForge holds no token.
 *  - Analysis runs in an ephemeral thread, read-only sandbox without network, approval policy "never", in an
 *    empty temp directory. Beyond configuration, the CLIENT enforces "no tools": every request from the server is
 *    refused and any tool/command/file/web item aborts the turn.
 *  - Only a turn with status "completed" counts as success (per OpenAI's app-server guidance).
 */
export class CodexProvider implements LocalAiProvider {
  readonly id = 'codex' as const;
  private readonly resolve: () => ResolvedCommand | null;
  private readonly env: NodeJS.ProcessEnv;
  private readonly analysisTimeoutMs: number;
  private readonly loginTimeoutMs: number;
  private login: LoginState = { state: 'idle' };
  private loginSession: { session: Session; loginId: string; timer: NodeJS.Timeout; cwd: string } | null = null;

  constructor(options: CodexOptions = {}) {
    this.resolve = options.resolve ?? (() => resolveProviderCommand('codex'));
    this.env = options.env ?? process.env;
    this.analysisTimeoutMs = options.analysisTimeoutMs ?? 150_000;
    this.loginTimeoutMs = options.loginTimeoutMs ?? 15 * 60 * 1000;
  }

  private command(): ResolvedCommand {
    const cmd = this.resolve();
    if (!cmd) throw new AiError('CLI_NOT_FOUND');
    return cmd;
  }

  /** Spawns app-server and completes the mandatory initialize → initialized handshake. */
  private async openSession(cwd: string, signal?: AbortSignal): Promise<Session> {
    const cmd = this.command();
    const child = spawnChild({
      command: cmd.command,
      args: [...cmd.prefixArgs, 'app-server', '--listen', 'stdio://'],
      cwd,
      env: buildChildEnv(this.env),
    });
    const session: Session = {
      client: null as unknown as JsonRpcClient,
      onNotification: () => {},
      onServerRequest: () => {},
      onClose: () => {},
      close: async () => {},
    };
    session.client = new JsonRpcClient(child, {
      onNotification: (m, p) => session.onNotification(m, p),
      onServerRequest: (m) => session.onServerRequest(m),
      onClose: (e) => session.onClose(e),
    });
    session.close = () => session.client.close();
    try {
      await session.client.request('initialize', { clientInfo: { name: 'signalforge', title: 'SignalForge', version: APP_VERSION } }, 15_000, signal);
      session.client.notify('initialized');
    } catch (error) {
      await session.close();
      throw error;
    }
    return session;
  }

  async checkHealth(options: RunOptions = {}): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    const base = { provider: 'codex' as const, checkedAt, installed: false, authenticated: null as boolean | null };
    let cmd: ResolvedCommand;
    try {
      cmd = this.command();
    } catch (error) {
      const code = (error as AiError).code;
      return { ...base, status: 'not_installed', displayMessage: AI_ERROR_INFO[code].message, remediation: AI_ERROR_INFO[code].remediation, errorCode: code };
    }
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-codex-'));
    try {
      const v = await runBounded({
        spec: { command: cmd.command, args: [...cmd.prefixArgs, '--version'], cwd, env: buildChildEnv(this.env) },
        timeoutMs: 15_000, maxStdoutBytes: 64 * 1024, maxStderrBytes: 64 * 1024, signal: options.signal,
      });
      if (v.spawnFailed || v.exitCode !== 0) {
        return { ...base, status: v.spawnFailed ? 'not_installed' : 'error', displayMessage: AI_ERROR_INFO.CLI_NOT_FOUND.message, remediation: AI_ERROR_INFO.CLI_NOT_FOUND.remediation, errorCode: 'CLI_NOT_FOUND' };
      }
      const version = /(\d+\.\d+\.\d+[\w.+-]*)/.exec(v.stdout)?.[1];

      const session = await this.openSession(cwd, options.signal);
      try {
        const res = asObj(await session.client.request('account/read', {}, 15_000, options.signal));
        const account = asObj(res?.account);
        if (!account) {
          if (res?.requiresOpenaiAuth === false) {
            return { ...base, installed: true, version, authenticated: null, status: 'unavailable', displayMessage: 'Codex memakai penyedia model kustom; status login tidak berlaku.', remediation: 'Jalankan “Uji koneksi” untuk memastikan.' };
          }
          return { ...base, installed: true, version, authenticated: false, status: 'not_authenticated', displayMessage: AI_ERROR_INFO.AUTH_REQUIRED.message, remediation: AI_ERROR_INFO.AUTH_REQUIRED.remediation, errorCode: 'AUTH_REQUIRED' };
        }
        const type = account.type;
        const apiBilling = type === 'apiKey';
        return {
          ...base, installed: true, version, authenticated: true, apiBilling,
          planLabel: type === 'chatgpt' && typeof account.planType === 'string' ? String(account.planType).slice(0, 40) : undefined,
          status: 'connected',
          displayMessage: apiBilling
            ? 'Masuk dengan API key (penagihan per pemakaian), bukan langganan ChatGPT Anda.'
            : 'Codex terpasang dan sudah masuk. Jalankan “Uji koneksi” untuk membuktikan permintaan berhasil.',
          remediation: apiBilling ? 'Untuk langganan: gunakan tombol Hubungkan (login ChatGPT resmi).' : undefined,
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      if (error instanceof AiError) {
        const status = error.code === 'CLI_NOT_FOUND' ? 'not_installed' : error.code === 'RATE_LIMITED' ? 'rate_limited' : 'error';
        return { ...base, status, displayMessage: error.message, remediation: error.remediation, errorCode: error.code };
      }
      throw error;
    } finally {
      await removeDir(cwd);
    }
  }

  // --- sign-in (official device-code flow; no token ever reaches SignalForge) ---

  loginState(): LoginState {
    return this.login;
  }

  async startLogin(): Promise<LoginInfo> {
    if (this.login.state === 'pending') return this.login.info;
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-codex-login-'));
    let session: Session | null = null;
    try {
      session = await this.openSession(cwd);
      const res = asObj(await session.client.request('account/login/start', { type: 'chatgptDeviceCode' }, 20_000));
      const url = typeof res?.verificationUrl === 'string' ? res.verificationUrl : '';
      const code = typeof res?.userCode === 'string' ? res.userCode : '';
      const loginId = typeof res?.loginId === 'string' ? res.loginId : '';
      let host = '';
      try {
        const u = new URL(url);
        if (u.protocol === 'https:') host = u.hostname;
      } catch {
        // invalid URL
      }
      if (res?.type !== 'chatgptDeviceCode' || !LOGIN_HOSTS.test(host) || !/^[A-Za-z0-9-]{4,32}$/.test(code) || !loginId) {
        throw new AiError('INVALID_RESPONSE');
      }
      const info: LoginInfo = { provider: 'codex', verificationUrl: url, userCode: code, startedAt: new Date().toISOString() };
      const owned = session;
      const finish = (next: LoginState) => {
        if (this.login.state !== 'pending') return; // the first terminal state wins; late events are ignored
        this.login = next;
        clearTimeout(this.loginSession?.timer);
        this.loginSession = null;
        void owned.close().then(() => removeDir(cwd));
      };
      owned.onNotification = (method, params) => {
        if (method !== 'account/login/completed') return;
        const p = asObj(params);
        const at = new Date().toISOString();
        finish(p?.success === true ? { state: 'completed', at } : { state: 'failed', at, code: 'AUTH_REQUIRED' });
      };
      owned.onClose = (e) => finish({ state: 'failed', at: new Date().toISOString(), code: e.code });
      const timer = setTimeout(() => finish({ state: 'failed', at: new Date().toISOString(), code: 'TIMEOUT' }), this.loginTimeoutMs);
      this.loginSession = { session: owned, loginId, timer, cwd };
      this.login = { state: 'pending', info };
      return info;
    } catch (error) {
      await session?.close();
      await removeDir(cwd);
      throw error;
    }
  }

  async cancelLogin(): Promise<void> {
    const s = this.loginSession;
    if (!s) return;
    try {
      await s.session.client.request('account/login/cancel', { loginId: s.loginId }, 5_000);
    } catch {
      // best effort; we close the process either way
    }
    clearTimeout(s.timer);
    await s.session.close();
    await removeDir(s.cwd);
    this.loginSession = null;
    this.login = { state: 'idle' };
  }

  // --- inference ---

  async testInference(options: RunOptions = {}): Promise<void> {
    const r = await this.runTurn({ prompt: TEST_PROMPT, maxOutputChars: 2000 }, options, 60_000);
    if (!r.text.trim()) throw new AiError('INVALID_RESPONSE');
  }

  analyze(request: AnalysisRequest, options: RunOptions = {}): Promise<AnalysisResult> {
    return this.runTurn(request, options, this.analysisTimeoutMs);
  }

  private runTurn(request: AnalysisRequest, options: RunOptions, timeoutMs: number): Promise<AnalysisResult> {
    return withProviderGuard('codex', async () => {
      const operationId = newOperationId();
      const started = Date.now();
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-codex-turn-'));
      let session: Session | null = null;
      try {
        session = await this.openSession(cwd, options.signal);
        const client = session.client;
        const thread = asObj(asObj(await client.request('thread/start', {
          cwd,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: true,
        }, 20_000, options.signal))?.thread);
        const threadId = typeof thread?.id === 'string' ? thread.id : '';
        if (!threadId) throw new AiError('INVALID_RESPONSE', operationId);

        let deltas = '';
        let finalText: string | null = null;
        let turnId: string | null = null;
        let blocked = false;
        let errorText = '';
        let errorInfo: unknown = null;

        const outcome = new Promise<void>((resolve, reject) => {
          const interrupt = () => {
            if (turnId) client.request('turn/interrupt', { threadId, turnId }, 3_000).catch(() => {});
          };
          const abortWith = (code: AiErrorCode) => {
            interrupt();
            reject(new AiError(code, operationId));
          };
          const timer = setTimeout(() => abortWith('TIMEOUT'), timeoutMs);
          const onAbort = () => abortWith('CANCELLED');
          options.signal?.addEventListener('abort', onAbort, { once: true });
          const done = (fn: () => void) => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
            fn();
          };

          session!.onClose = (e) => done(() => reject(e.code === 'CANCELLED' ? e : new AiError('PROVIDER_ERROR', operationId)));
          session!.onServerRequest = () => {
            blocked = true;
            done(() => abortWith('TOOL_USE_BLOCKED'));
          };
          session!.onNotification = (method, params) => {
            const p = asObj(params);
            if (!p || p.threadId !== threadId) return;
            if (method === 'item/started') {
              const type = asObj(p.item)?.type;
              if (typeof type === 'string' && BLOCKED_ITEM_TYPES.has(type)) {
                blocked = true;
                done(() => abortWith('TOOL_USE_BLOCKED'));
              }
            } else if (method === 'item/agentMessage/delta') {
              if (typeof p.delta === 'string') deltas += p.delta;
              if (deltas.length > request.maxOutputChars * 2) done(() => abortWith('INVALID_RESPONSE'));
            } else if (method === 'item/completed') {
              const item = asObj(p.item);
              if (item?.type === 'agentMessage' && typeof item.text === 'string') finalText = item.text;
            } else if (method === 'error') {
              const err = asObj(p.error);
              if (p.willRetry !== true) {
                errorText = String(err?.message ?? '').slice(0, 300);
                errorInfo = err?.codexErrorInfo ?? null;
              }
            } else if (method === 'turn/completed') {
              const turn = asObj(p.turn);
              const status = turn?.status;
              if (status === 'completed') done(resolve);
              else if (status === 'interrupted') done(() => reject(new AiError('CANCELLED', operationId)));
              else {
                const te = asObj(turn?.error);
                const msg = String(te?.message ?? errorText ?? '');
                done(() => reject(new AiError(mapCodexError(msg, te?.codexErrorInfo ?? errorInfo), operationId)));
              }
            }
          };
        });
        // Avoid an unhandled rejection if the turn fails before we start awaiting `outcome`.
        outcome.catch(() => {});

        const started_ = asObj(await client.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: request.prompt, text_elements: [] }],
          approvalPolicy: 'never',
          sandboxPolicy: { type: 'readOnly', networkAccess: false },
        }, 20_000, options.signal));
        turnId = typeof asObj(started_?.turn)?.id === 'string' ? (asObj(started_?.turn)!.id as string) : null;

        await outcome;
        if (blocked) throw new AiError('TOOL_USE_BLOCKED', operationId);
        const text = (finalText ?? deltas).trim();
        if (!text || text.length > request.maxOutputChars) throw new AiError('INVALID_RESPONSE', operationId);
        return { provider: 'codex' as const, text, model: typeof thread?.model === 'string' ? thread.model.slice(0, 80) : null, durationMs: Date.now() - started };
      } catch (error) {
        if (error instanceof AiError) {
          if (error.code === 'PROVIDER_ERROR' && (error as unknown as { rpcMessage?: string }).rpcMessage !== undefined) {
            throw new AiError(classifyFailure(rpcFailureText(error)), operationId);
          }
          throw error;
        }
        throw error;
      } finally {
        await session?.close();
        await removeDir(cwd);
      }
    });
  }
}
