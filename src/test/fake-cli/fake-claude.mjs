// Test double for the `claude` CLI. NOT shipped; used only by adapter tests (never a real login or request).
// Usage: node fake-claude.mjs --scenario=<name> --capture=<file> [real adapter args...]
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const scenario = opt('scenario') ?? 'ok';
const capture = opt('capture');
const args = argv.filter((a) => !a.startsWith('--scenario=') && !a.startsWith('--capture='));

const GOOD = `## Findings
Pada YouTube, E1 memiliki nilai 900 (S1) dan E2 bernilai 0 (S2); ini indikasi, bukan sebab-akibat.
## Evidence
- E1: 900 views pada usia 24 jam (S1)
- E2: 0 views, nol terukur (S2)
## Limitations
Sampel kecil (n=2); platform lain tidak dibandingkan.
## Hypotheses
Hook yang berbeda mungkin berkaitan dengan perbedaan (hipotesis).
## Next Experiment
Uji satu variabel: bentuk hook, metrik views pada 24 jam.
## Success Criteria
Median varian minimal 20% lebih tinggi dari baseline.`;

const out = (o) => process.stdout.write(JSON.stringify(o));
let stdin = '';

function record() {
  if (!capture) return;
  fs.appendFileSync(capture, JSON.stringify({ args, cwd: process.cwd(), envKeys: Object.keys(process.env).sort(), stdinChars: stdin.length, stdinHead: stdin.slice(0, 80) }) + '\n');
}

if (args[0] === '--version') {
  record();
  console.log('2.1.999 (Claude Code)');
} else if (args[0] === 'auth' && args[1] === 'status') {
  record();
  if (scenario === 'logged_out') {
    out({ loggedIn: false });
    process.exit(1);
  } else if (scenario === 'api_billing') out({ loggedIn: true, authMethod: 'console' });
  else if (scenario === 'unparsable_status') process.stdout.write('???');
  else out({ loggedIn: true, subscriptionType: 'max' });
} else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (stdin += c));
  process.stdin.on('end', () => {
    record();
    switch (scenario) {
      case 'hang':
        if (capture) fs.writeFileSync(`${capture}.pid`, String(process.pid));
        setInterval(() => {}, 1000);
        break;
      case 'logged_out':
        out({ type: 'result', is_error: true, result: 'Not logged in · Please run /login' });
        process.exit(1);
        break;
      case 'expired':
        out({ type: 'result', is_error: true, result: 'OAuth token has expired. Please re-authenticate.' });
        process.exit(1);
        break;
      case 'rate_limited':
        out({ type: 'result', is_error: true, result: 'Claude usage limit reached. Resets at 5pm.' });
        process.exit(1);
        break;
      case 'network':
        process.stderr.write('fetch failed: getaddrinfo ENOTFOUND api.example\n');
        process.exit(1);
        break;
      case 'bad_json':
        process.stdout.write('this is not json');
        break;
      case 'huge':
        process.stdout.write('x'.repeat(3 * 1024 * 1024));
        break;
      case 'secret_in_error':
        out({ type: 'result', is_error: true, result: 'boom sk-ant-SECRET-VALUE-123 /home/user/.claude/.credentials.json' });
        process.exit(1);
        break;
      case 'empty':
        out({ type: 'result', is_error: false, result: '' });
        break;
      case 'ok_test':
        out({ type: 'result', is_error: false, result: 'OK', model: 'fake-model' });
        break;
      default:
        out({ type: 'result', is_error: false, result: GOOD, model: 'fake-claude-model' });
    }
  });
}
