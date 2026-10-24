import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiError, type AiErrorCode } from './errors';
import { ClaudeProvider } from './claude';
import { CodexProvider } from './codex';
import { MAX_CALLS_PER_WINDOW, resetGuardForTests } from './guard';
import { validateAnalysisText } from './analysis';

const script = (name: string) => fileURLToPath(new URL(`../../test/fake-cli/${name}`, import.meta.url));
const CLAUDE = script('fake-claude.mjs');
const CODEX = script('fake-codex.mjs');

let dir: string;
let capture: string;
beforeEach(() => {
  resetGuardForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ai-'));
  capture = path.join(dir, 'capture.jsonl');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// A server environment full of secrets that must never reach a provider process.
const HOSTILE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  ANTHROPIC_API_KEY: 'sk-ant-LEAK-1',
  ANTHROPIC_AUTH_TOKEN: 'LEAK-2',
  OPENAI_API_KEY: 'sk-LEAK-3',
  CODEX_ACCESS_TOKEN: 'LEAK-4',
  AWS_SECRET_ACCESS_KEY: 'LEAK-5',
  DATABASE_PASSWORD: 'LEAK-6',
  SIGNALFORGE_DATA_DIR: '/secret/data',
};

const claude = (scenario: string, extra: Partial<ConstructorParameters<typeof ClaudeProvider>[0]> = {}) =>
  new ClaudeProvider({
    resolve: () => ({ command: process.execPath, prefixArgs: [CLAUDE, `--scenario=${scenario}`, `--capture=${capture}`], source: 'override' }),
    env: HOSTILE_ENV,
    ...extra,
  });
const codex = (scenario: string, extra: Partial<ConstructorParameters<typeof CodexProvider>[0]> = {}) =>
  new CodexProvider({
    resolve: () => ({ command: process.execPath, prefixArgs: [CODEX, `--scenario=${scenario}`, `--capture=${capture}`], source: 'override' }),
    env: HOSTILE_ENV,
    ...extra,
  });

const records = () => (fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : []);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitDead = async (pid: number) => {
  for (let i = 0; i < 40 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
  return !alive(pid);
};
const code = async (p: Promise<unknown>): Promise<AiErrorCode> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e.code;
    throw e;
  }
  throw new Error('expected an AiError');
};

const PROMPT = 'PROMPT-WITH-DATA <data>{"x":1}</data>';
const REQ = { prompt: PROMPT, maxOutputChars: 12_000 };

describe('child environment', () => {
  it('Claude never receives API keys, tokens or unrelated secrets', async () => {
    await claude('ok').checkHealth();
    const keys = (records()[0] as { envKeys: string[] }).envKeys.map((k) => k.toUpperCase());
    for (const leaked of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_PASSWORD', 'SIGNALFORGE_DATA_DIR']) {
      expect(keys, leaked).not.toContain(leaked);
    }
    expect(keys).toContain('PATH');
  });

  it('Codex never receives API keys, tokens or unrelated secrets', async () => {
    await codex('ok').checkHealth();
    const keys = (records().find((r) => r.kind === 'version') as { envKeys: string[] }).envKeys.map((k) => k.toUpperCase());
    for (const leaked of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_PASSWORD']) {
      expect(keys, leaked).not.toContain(leaked);
    }
  });
});

describe('Claude adapter', () => {
  it('reports installed + signed in from the official status command (no inference)', async () => {
    const h = await claude('ok').checkHealth();
    expect(h).toMatchObject({ provider: 'claude', status: 'connected', installed: true, authenticated: true, version: '2.1.999', planLabel: 'max' });
    expect(h.displayMessage).toMatch(/Uji koneksi/); // "connected" is not proof of inference
    expect(records().map((r) => (r.args as string[]).join(' '))).toEqual(['--version', 'auth status --json']);
  });

  it('distinguishes signed out, API billing, unreadable status and not installed', async () => {
    expect(await claude('logged_out').checkHealth()).toMatchObject({ status: 'not_authenticated', authenticated: false, errorCode: 'AUTH_REQUIRED' });
    expect(await claude('api_billing').checkHealth()).toMatchObject({ status: 'connected', apiBilling: true });
    expect((await claude('api_billing').checkHealth()).displayMessage).toMatch(/bukan langganan/);
    expect(await claude('unparsable_status').checkHealth()).toMatchObject({ status: 'unavailable', authenticated: null });
    const missing = new ClaudeProvider({ resolve: () => null });
    expect(await missing.checkHealth()).toMatchObject({ status: 'not_installed', installed: false, errorCode: 'CLI_NOT_FOUND' });
  });

  it('analyzes with every tool disabled, sessions off, no --bare, prompt on stdin, in an empty temp dir', async () => {
    const r = await claude('ok').analyze(REQ);
    expect(r).toMatchObject({ provider: 'claude', model: 'fake-claude-model' });
    expect(() => validateAnalysisText(r.text, new Set(['E1', 'E2', 'S1', 'S2']))).not.toThrow();

    const call = records().at(-1) as { args: string[]; cwd: string; stdinChars: number; stdinHead: string };
    expect(call.args).toEqual(['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--disable-slash-commands']);
    expect(call.args).not.toContain('--bare'); // --bare would force API-key billing
    expect(call.stdinHead).toBe(PROMPT.slice(0, 80));
    expect(call.stdinChars).toBe(PROMPT.length);
    expect(call.cwd.startsWith(os.tmpdir())).toBe(true);
    expect(fs.existsSync(call.cwd)).toBe(false); // temp dir removed afterwards
  });

  it.each<[string, AiErrorCode]>([
    ['logged_out', 'AUTH_REQUIRED'],
    ['expired', 'AUTH_EXPIRED'],
    ['rate_limited', 'RATE_LIMITED'],
    ['network', 'NETWORK_UNAVAILABLE'],
    ['bad_json', 'INVALID_RESPONSE'],
    ['huge', 'INVALID_RESPONSE'],
    ['empty', 'INVALID_RESPONSE'],
    ['secret_in_error', 'PROVIDER_ERROR'],
  ])('maps scenario %s to %s', async (scenario, expected) => {
    expect(await code(claude(scenario).analyze(REQ))).toBe(expected);
  });

  it('never surfaces provider text, secrets or credential paths in errors', async () => {
    try {
      await claude('secret_in_error').analyze(REQ);
      expect.unreachable();
    } catch (e) {
      const text = JSON.stringify({ m: (e as AiError).message, r: (e as AiError).remediation, c: (e as AiError).code });
      expect(text).not.toMatch(/sk-ant|SECRET|credentials|\.claude/i);
      expect((e as AiError).operationId).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('times out, kills the process and reports TIMEOUT', async () => {
    const started = Date.now();
    expect(await code(claude('hang', { analysisTimeoutMs: 600 }).analyze(REQ))).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await waitDead(Number(fs.readFileSync(`${capture}.pid`, 'utf8')))).toBe(true);
  });

  it('cancels on abort and kills the process', async () => {
    const ctl = new AbortController();
    const p = claude('hang').analyze(REQ, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 400);
    expect(await code(p)).toBe('CANCELLED');
    expect(await waitDead(Number(fs.readFileSync(`${capture}.pid`, 'utf8')))).toBe(true);
  });

  it('allows only one request at a time per provider', async () => {
    const provider = claude('ok');
    const first = provider.analyze(REQ);
    expect(await code(provider.analyze(REQ))).toBe('BUSY');
    await first;
  });

  it('limits how many calls fit in the rolling window', async () => {
    const provider = claude('ok_test');
    for (let i = 0; i < MAX_CALLS_PER_WINDOW; i++) await provider.analyze({ prompt: 'x', maxOutputChars: 100 });
    expect(await code(provider.analyze({ prompt: 'x', maxOutputChars: 100 }))).toBe('BUSY');
  }, 60_000);

  it('Test connection needs a real, non-empty answer', async () => {
    await expect(claude('ok_test').testInference()).resolves.toBeUndefined();
    resetGuardForTests();
    expect(await code(claude('empty').testInference())).toBe('INVALID_RESPONSE');
  });
});

describe('Codex adapter (app-server JSON-RPC)', () => {
  it('completes the initialize/initialized handshake and reads the account without inference', async () => {
    const h = await codex('ok').checkHealth();
    expect(h).toMatchObject({ provider: 'codex', status: 'connected', installed: true, authenticated: true, version: '0.155.0', planLabel: 'plus' });
    expect(JSON.stringify(h)).not.toContain('person@example.com'); // account e-mail is not surfaced
    const reqs = records().filter((r) => r.kind === 'request') as { method: string; params: { clientInfo?: { name: string; version: string } }; args: string[] }[];
    expect(reqs.map((r) => r.method)).toEqual(['initialize', 'initialized', 'account/read']);
    expect(reqs[0]!.params.clientInfo).toMatchObject({ name: 'signalforge', version: expect.any(String) });
    expect(reqs[0]!.args).toEqual(['app-server', '--listen', 'stdio://']);
  });

  it('reports signed out, API-key accounts, not installed, and a broken protocol', async () => {
    expect(await codex('logged_out').checkHealth()).toMatchObject({ status: 'not_authenticated', authenticated: false });
    expect(await codex('api_key').checkHealth()).toMatchObject({ status: 'connected', apiBilling: true });
    expect(await new CodexProvider({ resolve: () => null }).checkHealth()).toMatchObject({ status: 'not_installed' });
    const broken = await codex('bad_json_line').checkHealth();
    expect(broken.status).toBe('error');
    expect(broken.errorCode).toBe('INVALID_RESPONSE');
  });

  it('runs an ephemeral, read-only, network-less, never-approve turn in an empty temp dir', async () => {
    const r = await codex('ok').analyze(REQ);
    expect(r).toMatchObject({ provider: 'codex', model: 'fake-codex-model' });
    expect(() => validateAnalysisText(r.text, new Set(['E1', 'S1']))).not.toThrow();

    const reqs = records().filter((r) => r.kind === 'request') as { method: string; params: Record<string, unknown>; cwd: string }[];
    const thread = reqs.find((r) => r.method === 'thread/start')!;
    expect(thread.params).toMatchObject({ approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true });
    const turn = reqs.find((r) => r.method === 'turn/start')!;
    expect(turn.params).toMatchObject({
      threadId: 'thread-1',
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      input: [{ type: 'text', text: PROMPT, text_elements: [] }],
    });
    expect(thread.cwd.startsWith(os.tmpdir())).toBe(true);
    expect(fs.existsSync(thread.cwd)).toBe(false);
  });

  it('can assemble the answer from streamed deltas', async () => {
    const r = await codex('deltas_only').analyze(REQ);
    expect(() => validateAnalysisText(r.text, new Set(['E1', 'E2', 'S1', 'S2']))).not.toThrow();
  });

  it.each<[string, AiErrorCode]>([
    ['unauthorized', 'AUTH_REQUIRED'],
    ['usage_limit', 'RATE_LIMITED'],
    ['network_down', 'NETWORK_UNAVAILABLE'],
    ['interrupted', 'CANCELLED'],
    ['crash', 'PROVIDER_ERROR'],
    ['bad_json_line', 'INVALID_RESPONSE'],
    ['huge', 'INVALID_RESPONSE'],
  ])('maps scenario %s to %s', async (scenario, expected) => {
    expect(await code(codex(scenario).analyze(REQ))).toBe(expected);
  });

  it('blocks any tool, command, file or web activity and interrupts the turn', async () => {
    for (const scenario of ['tool_attempt', 'web_search']) {
      resetGuardForTests();
      fs.rmSync(capture, { force: true });
      expect(await code(codex(scenario).analyze(REQ)), scenario).toBe('TOOL_USE_BLOCKED');
      await new Promise((r) => setTimeout(r, 150));
      expect(records().some((r) => r.method === 'turn/interrupt'), `${scenario} interrupt`).toBe(true);
    }
  });

  it('refuses every request coming from the server (approvals) and aborts', async () => {
    expect(await code(codex('server_request').analyze(REQ))).toBe('TOOL_USE_BLOCKED');
    await new Promise((r) => setTimeout(r, 150));
    expect(records().find((r) => r.kind === 'client-response')).toMatchObject({ error: -32601 });
  });

  it('times out, interrupts and kills app-server', async () => {
    expect(await code(codex('hang', { analysisTimeoutMs: 700 }).analyze(REQ))).toBe('TIMEOUT');
    await new Promise((r) => setTimeout(r, 200));
    expect(records().some((r) => r.method === 'turn/interrupt')).toBe(true);
  });

  it('cancels on abort', async () => {
    const ctl = new AbortController();
    const p = codex('hang').analyze(REQ, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 500);
    expect(await code(p)).toBe('CANCELLED');
  });

  it('only a completed turn counts as success; test connection needs a real answer', async () => {
    await expect(codex('ok_test').testInference()).resolves.toBeUndefined();
    resetGuardForTests();
    expect(await code(codex('unauthorized').testInference())).toBe('AUTH_REQUIRED');
  });

  it('serializes requests: a second call while one is running is BUSY', async () => {
    const provider = codex('ok');
    const first = provider.analyze(REQ);
    expect(await code(provider.analyze(REQ))).toBe('BUSY');
    await first;
  });
});

describe('Codex sign-in (official device-code flow)', () => {
  it('starts the managed login and returns only a URL and one-time code; completion is observed', async () => {
    const provider = codex('login_ok');
    const info = await provider.startLogin();
    expect(info).toMatchObject({ provider: 'codex', verificationUrl: 'https://chatgpt.com/device', userCode: 'ABCD-1234' });
    expect(provider.loginState().state).toBe('pending');
    for (let i = 0; i < 40 && provider.loginState().state === 'pending'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(provider.loginState().state).toBe('completed');
    expect(JSON.stringify(provider.loginState())).not.toMatch(/token|secret|password/i);
    const sent = (records().filter((r) => r.kind === 'request') as { method: string; params: Record<string, unknown> }[]).find((r) => r.method === 'account/login/start')!;
    expect(sent.params).toEqual({ type: 'chatgptDeviceCode' }); // never apiKey / access-token variants
  });

  it('reports a denied login without inventing success', async () => {
    const provider = codex('login_denied');
    await provider.startLogin();
    for (let i = 0; i < 40 && provider.loginState().state === 'pending'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(provider.loginState()).toMatchObject({ state: 'failed', code: 'AUTH_REQUIRED' });
  });

  it('rejects a verification URL that is not an https OpenAI/ChatGPT host', async () => {
    const provider = codex('login_bad_url');
    expect(await code(provider.startLogin())).toBe('INVALID_RESPONSE');
    expect(provider.loginState().state).toBe('idle');
  });

  it('can be cancelled', async () => {
    const provider = codex('login_ok', { loginTimeoutMs: 60_000 });
    await provider.startLogin();
    await provider.cancelLogin();
    expect(provider.loginState().state).toBe('idle');
    await new Promise((r) => setTimeout(r, 150));
    expect(records().some((r) => r.method === 'account/login/cancel')).toBe(true);
  });

  it('gives up after the login timeout', async () => {
    const provider = codex('login_ok', { loginTimeoutMs: 60 }); // the fake would complete at 200ms; the timeout fires first
    await provider.startLogin();
    await new Promise((r) => setTimeout(r, 400));
    expect(provider.loginState()).toMatchObject({ state: 'failed', code: 'TIMEOUT' });
  });
});
