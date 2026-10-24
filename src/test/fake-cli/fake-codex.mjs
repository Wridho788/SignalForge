// Test double for `codex` (CLI + `app-server` JSON-RPC over stdio). NOT shipped; adapter tests only.
// Usage: node fake-codex.mjs --scenario=<name> --capture=<file> [real adapter args...]
import fs from 'node:fs';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const scenario = opt('scenario') ?? 'ok';
const capture = opt('capture');
const args = argv.filter((a) => !a.startsWith('--scenario=') && !a.startsWith('--capture='));
const log = (entry) => capture && fs.appendFileSync(capture, JSON.stringify(entry) + '\n');

if (args[0] === '--version') {
  log({ kind: 'version', envKeys: Object.keys(process.env).sort() });
  console.log('codex-cli 0.155.0');
  process.exit(0);
}

const GOOD = `## Findings
Di TikTok, E1 mencapai 12000 (S1) pada usia 24 jam; ini indikasi, bukan sebab-akibat.
## Evidence
- E1: 12000 views (S1)
## Limitations
Hanya satu post sebanding (n=1).
## Hypotheses
Durasi video mungkin berpengaruh (hipotesis).
## Next Experiment
Ubah satu variabel: durasi; metrik views pada 24 jam.
## Success Criteria
Median varian minimal 20% lebih tinggi dari baseline.`;

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
let reqId = 1000;

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.method === undefined) {
    log({ kind: 'client-response', id: m.id, error: m.error?.code });
    return;
  }
  log({ kind: 'request', method: m.method, params: m.params, args, cwd: process.cwd(), envKeys: Object.keys(process.env).sort() });
  if (m.id === undefined) return; // notification (initialized)

  switch (m.method) {
    case 'initialize':
      if (scenario === 'bad_json_line') process.stdout.write('{not json}\n');
      send({ id: m.id, result: { userAgent: 'fake-codex' } });
      break;
    case 'account/read':
      send({
        id: m.id,
        result:
          scenario === 'logged_out'
            ? { account: null, requiresOpenaiAuth: true }
            : scenario === 'api_key'
              ? { account: { type: 'apiKey' }, requiresOpenaiAuth: true }
              : { account: { type: 'chatgpt', email: 'person@example.com', planType: 'plus' }, requiresOpenaiAuth: true },
      });
      break;
    case 'account/login/start': {
      const bad = scenario === 'login_bad_url';
      send({ id: m.id, result: { type: 'chatgptDeviceCode', loginId: 'login-1', userCode: 'ABCD-1234', verificationUrl: bad ? 'https://evil.example/phish' : 'https://chatgpt.com/device' } });
      if (scenario === 'login_ok') setTimeout(() => send({ method: 'account/login/completed', params: { success: true, loginId: 'login-1', error: null } }), 200);
      if (scenario === 'login_denied') setTimeout(() => send({ method: 'account/login/completed', params: { success: false, loginId: 'login-1', error: 'denied' } }), 200);
      break;
    }
    case 'account/login/cancel':
      send({ id: m.id, result: { status: 'canceled' } });
      break;
    case 'thread/start':
      send({ id: m.id, result: { thread: { id: 'thread-1', model: 'fake-codex-model', ephemeral: true }, approvalPolicy: 'never', sandbox: 'read-only', cwd: process.cwd(), model: 'fake-codex-model', modelProvider: 'fake', approvalsReviewer: 'user' } });
      break;
    case 'turn/interrupt':
      send({ id: m.id, result: {} });
      break;
    case 'turn/start':
      send({ id: m.id, result: { turn: { id: 'turn-1', status: 'inProgress', items: [] } } });
      runTurn();
      break;
    default:
      send({ id: m.id, error: { code: -32601, message: 'unknown method' } });
  }
});

const note = (method, params) => send({ method, params: { threadId: 'thread-1', turnId: 'turn-1', ...params } });
const completed = (turn) => note('turn/completed', { turn: { id: 'turn-1', status: 'completed', items: [], ...turn } });

function runTurn() {
  setTimeout(() => {
    note('turn/started', { turn: { id: 'turn-1', status: 'inProgress', items: [] } });
    switch (scenario) {
      case 'hang':
        return;
      case 'crash':
        process.exit(3);
        return;
      case 'tool_attempt':
        note('item/started', { item: { type: 'commandExecution', id: 'i1', command: 'dir' }, startedAtMs: 1 });
        return;
      case 'web_search':
        note('item/started', { item: { type: 'webSearch', id: 'i1' }, startedAtMs: 1 });
        return;
      case 'server_request':
        send({ id: reqId++, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'i1', command: 'rm -rf /' } });
        return;
      case 'unauthorized':
        note('turn/completed', { turn: { id: 'turn-1', status: 'failed', items: [], error: { message: 'Authentication failed', codexErrorInfo: 'unauthorized' } } });
        return;
      case 'usage_limit':
        note('error', { error: { message: 'You hit your usage limit', codexErrorInfo: 'usageLimitExceeded' }, willRetry: false });
        note('turn/completed', { turn: { id: 'turn-1', status: 'failed', items: [], error: { message: 'You hit your usage limit', codexErrorInfo: 'usageLimitExceeded' } } });
        return;
      case 'network_down':
        note('turn/completed', { turn: { id: 'turn-1', status: 'failed', items: [], error: { message: 'stream disconnected', codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } } } } });
        return;
      case 'interrupted':
        note('turn/completed', { turn: { id: 'turn-1', status: 'interrupted', items: [] } });
        return;
      case 'invalid_text':
        note('item/completed', { item: { type: 'agentMessage', id: 'm1', text: 'No headings here, just prose.' }, completedAtMs: 2 });
        completed({});
        return;
      case 'huge': {
        const chunk = 'y'.repeat(2000);
        for (let i = 0; i < 50; i++) note('item/agentMessage/delta', { itemId: 'm1', delta: chunk });
        completed({});
        return;
      }
      case 'ok_test':
        note('item/completed', { item: { type: 'agentMessage', id: 'm1', text: 'OK' }, completedAtMs: 2 });
        completed({});
        return;
      case 'deltas_only':
        for (const part of GOOD.match(/.{1,60}/gs)) note('item/agentMessage/delta', { itemId: 'm1', delta: part });
        completed({});
        return;
      default:
        note('item/started', { item: { type: 'agentMessage', id: 'm1', text: '' }, startedAtMs: 1 });
        note('item/completed', { item: { type: 'agentMessage', id: 'm1', text: GOOD }, completedAtMs: 2 });
        completed({});
    }
  }, 30);
}
