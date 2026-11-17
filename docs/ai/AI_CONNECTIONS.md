# AI Connections: Claude, Codex, and Gemini

## 1. UX decision: “Connect account”, not “Get token”

A raw token is a credential, not a normal setup artifact. SignalForge should not ask users to paste access tokens, reveal token values, or attempt to extract tokens from private credential files. Use a button labelled **Connect Claude** / **Connect Codex** or **Sign in via official CLI**. A separate **How to set up** section explains requirements and launches official documentation.

The product may call this page “AI Connections”. A token should only be handled by an official supported auth flow or an explicitly supported secure token exchange; it should not be shown to the user after connection.

## 2. Provider integration choices

### Codex
For a product UI that needs login state, conversation threads, approvals, and streamed events, evaluate the official Codex app-server first. Official documentation describes app-server as the deep-integration interface; Codex SDK is positioned for automating jobs/CI. The app-server supports ChatGPT-managed login flows and account/rate-limit inspection. Verify version-specific schema against the installed Codex CLI because the protocol evolves.

Official references:
- App-server overview/protocol: https://learn.chatgpt.com/docs/app-server
- Sign in with ChatGPT / app-server integration: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server — **reference only.** That path is about sharing tokens with a third-party app; SignalForge does not use it. It never receives a token (see §10).
- Authentication and local credential handling: https://learn.chatgpt.com/docs/auth

Implementation requirements:
- Spawn `codex app-server --listen stdio://` as a child process, unless the chosen supported library offers a safer wrapper.
- Keep stdio private to the server; do not expose app-server as a network listener in the local MVP.
- Implement JSON-RPC request correlation, initialization handshake, message parsing, timeout, cancellation, process exit handling and bounded buffers.
- Use official `account/login/start` with `chatgpt` or `chatgptDeviceCode` mode where supported by the installed protocol. Do not ask users to paste tokens.
- Use `account/read` for status and `account/rateLimits/read` only if the product actually needs that information. Display usage limits carefully and do not imply an exact reset time unless returned.
- Treat app-server WebSocket transport as experimental per current docs; prefer stdio for local child process communication.
- Do not build a hosted commercial auth flow around app-server login without checking OpenAI’s current terms and approved integration paths.

### Claude
For a local personal dashboard, evaluate the official Claude Code CLI and/or Claude Agent SDK using supported local authentication. Do not assume every Claude plan or third-party use is permitted indefinitely; verify current Anthropic docs and plan limits before shipping.

Official references:
- Claude Code setup/authentication: https://code.claude.com/docs/en/getting-started (canonical; the older `docs.anthropic.com/.../claude-code/getting-started` address redirects here)
- Claude plan and Agent SDK usage: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Claude Code with Pro/Max: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan

Implementation requirements:
- Prefer official CLI login/credential management; do not implement OAuth scraping or read/parse private credential files yourself.
- If using Agent SDK, disable tools for analytics-only prompts, limit turns, bound payload/output, add timeout/cancellation, and normalize errors.
- Distinguish CLI installed from authenticated and from successful inference. A lightweight inference health check may consume usage allowance; tell the user before running it or make the cost explicit.
- If the installed version cannot use the expected subscription auth path, show the official sign-in instructions and keep AI marked disconnected. Do not silently fall back to paid API-key billing.
- Respect plan-specific and third-party-use restrictions. If a supported subscription route is not available, explain the alternatives rather than collecting a secret manually.

## 3. Page specification

Route: `/settings/ai-connections`

### Header
- Title: AI Connections
- Description: “Connect optional AI assistants to analyze selected dashboard data. Your dashboard works without AI.”
- Security note: “Sign-in is handled by the provider’s official local login flow. SignalForge never displays your tokens.”

### Provider cards
Each card includes:
- Provider logo/name and integration type (Codex app-server / Claude CLI or Agent SDK).
- Status: Not installed, Sign-in required, Connected, Checking, Usage limited, Unavailable, Error.
- Last checked timestamp.
- Primary button: Connect / Sign in / Reconnect.
- Secondary button: Test connection.
- Link/button: How to set up.
- Collapsible safe diagnostics with error code and next step, no secrets.

### How to set up panel
- OS selector: Windows, macOS, Linux/WSL where applicable.
- Numbered steps with copyable commands from official docs.
- Official documentation links.
- Explanation of subscription/API billing distinction.
- Troubleshooting for CLI missing, browser login callback, expired session, rate limit, unsupported plan, network unavailable.
- No manual token field in MVP.

### Consent before analysis
Before a provider receives data, show:
- selected date range;
- number of episodes/distributions/snapshots;
- fields included;
- explicit note that data will be sent to the chosen provider;
- Cancel and Continue buttons.

Do not include script text or notes by default. Let the user explicitly opt into sending them if supported and necessary.

## 4. Provider API contract

```ts
type ProviderStatus =
  | 'not_installed'
  | 'not_authenticated'
  | 'checking'
  | 'connected'
  | 'rate_limited'
  | 'unavailable'
  | 'error';

interface ProviderHealth {
  provider: 'claude' | 'codex' | 'gemini';
  status: ProviderStatus;
  checkedAt: string;
  displayMessage: string;
  remediation?: string;
  accountLabel?: string; // optional, non-sensitive; never token
  planLabel?: string;    // only if official protocol returns it
}
```

Use provider-specific adapters behind a stable interface. Do not leak raw SDK response objects to the browser.

## 5. Error mapping

- `CLI_NOT_FOUND`: provide install instructions.
- `AUTH_REQUIRED`: offer official login flow.
- `AUTH_EXPIRED`: offer reconnect; do not delete provider credentials automatically.
- `RATE_LIMITED`: explain that provider usage limit was reached; avoid aggressive retries.
- `NETWORK_UNAVAILABLE`: suggest connectivity check; preserve local data.
- `TIMEOUT`: stop/wait for process exit; let user retry.
- `PROVIDER_ERROR`: show safe generic message and operation id.
- `INVALID_RESPONSE`: record safe diagnostic; do not render raw response.

## 6. AI analysis contract

Input should be a minimized, typed summary, not the whole database. Include data provenance and nulls explicitly. Prompt requirements:
- Do not invent missing metrics.
- Separate observations from hypotheses.
- Do not claim causal relationships from observational data.
- Compare platform metrics only when definitions and observation windows are compatible.
- Cite episode codes/snapshot IDs as internal evidence references.
- State sample size, missingness and time-window limitations.
- Return structured sections: Findings, Evidence, Limitations, Hypotheses, Next Experiment, Success Criteria.

Output must be treated as untrusted text. Render Markdown safely with raw HTML disabled. Do not execute code or tool calls from AI output.

## 7. Health check design

- “CLI present” is a local executable check and is not equivalent to authenticated.
- “Connection test” runs a short provider request only after user action or explicit consent.
- Use a strict timeout and one in-flight check per provider.
- Never include tokens in health-check response, app logs or analytics payload.
- Do not retry rate-limit/auth errors automatically.
- Display “Last checked” and provider status; do not report “Connected” merely because a process launched.

## 8. Security constraints

- All provider processes start server-side, with fixed command/argument arrays and `shell: false`.
- No token textbox, localStorage token, browser cookie extraction, or credential-file parsing.
- Do not expose child process stdio to the browser.
- Loopback bind, Origin/Host checks and CSRF protection are required defense-in-depth.
- Limit request size, output size, execution time and concurrent requests.
- Set minimal environment variables; never dump process.env.
- Ensure process termination on timeout, app shutdown, cancellation and client disconnect.
- Before any deployment or multi-user use, reassess auth permissions and provider terms.

## 9. As built (M7)

Decision record: ADR 0008. Code: `src/lib/ai/` (adapters, process/JSON-RPC plumbing, payload and output validation), `src/lib/services/ai.ts`, `src/app/api/ai/{preview,analyze}`, `src/features/ai/`, pages `/settings/ai-connections` and `/analytics/ai`.

- **Status model.** Three separate facts are never merged: *installed*, *signed in*, and *a request actually succeeded* (the last result of “Uji koneksi” is shown with its time). “Terhubung” alone does not claim inference works. Opening a page never spawns a CLI: pages read an in-memory cache, and the card runs a **local** status check (version / account state) once when there is no cache. Only “Uji koneksi” and “Analisis” send a real request, after explicit consent.
- **Sign-in.** Codex: the “Masuk” button starts the official device-code flow; the card shows the verification page (https, `openai.com`/`chatgpt.com` only) and the one-time code, polls the state, and re-checks status on completion. Claude: the card shows the official terminal command (`claude auth login --claudeai`) because the CLI's own login is interactive; SignalForge does not drive it. There is no token field anywhere (an E2E test scans the AI pages for credential-like inputs).
- **Billing.** If a CLI reports API-key/Console billing, the card says so; SignalForge never forwards `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` to the child process, so it cannot silently fall back to paid API usage.
- **Setup panel.** OS selector (Windows, macOS, Linux/WSL), numbered steps with copyable commands, official links, billing explanation, troubleshooting. Commands are fixed text from the official docs; they are displayed for the user to run and are never executed by SignalForge. Commands and links can change between releases: verify them on the linked pages.
- **Consent.** `/analytics/ai` carries the current analytics filters. “Tinjau data yang akan dikirim” shows date range, counts (episodes, distributions, snapshots), fields included and excluded, the provider that will receive the data, and the exact JSON (collapsible). Titles are opt-in. Continue / Cancel; a running analysis can be cancelled, which stops the provider process.
- **Result.** Provider, model (if reported), generation time, data subset, the six sections with Indonesian labels, an “advisory, not fact” banner, a warning for citations that are not in the sent data, an alias legend resolved locally, and copy/retry/close. Results are not stored.
- **Limits.** ≤ 60 posts and ≤ 60,000 payload characters; request bodies to the API ≤ 4 KB; output ≤ 12,000 characters; 120 s (Claude) / 150 s (Codex) analysis timeout; 1 in-flight call and 12 calls / 10 minutes per provider.
- **Test mode.** `SIGNALFORGE_AI_MODE=fake` (used by the Playwright server only) replaces all providers with an in-process fake driven by `<data dir>/fake-ai.json`; a “Mode uji” banner is shown. `SIGNALFORGE_CLAUDE_PATH` / `SIGNALFORGE_CODEX_PATH` can point to an executable that is not on PATH.

## 10. Gemini API Free Tier (2026-11-17)

- Gemini uses Google's official Gemini Developer API directly from server-only code. Model is fixed to `gemini-3.5-flash-lite`; the app does not accept a model name or enable tools/grounding. Google's current pricing page lists standard input/output as free for this model. Availability, limits, and billing rules can change; recheck Google's pricing before release. **Not re-confirmed on 2026-11-17:** the pricing page could not be re-read in that session (no network access to it), so "listed as free" still rests on the earlier reading — see the ADR 0009 verification note.
- `GEMINI_API_KEY` is read from the SignalForge server process environment only. SignalForge does not write or persist it in `.env` files, return it to the browser, or log it. The setup guide requests it with hidden terminal input and removes it from that shell session after the app exits. Use an AI Studio Free Tier project with billing disabled; a key associated with a billed project may have different billing behavior.
- A local health check only detects whether a key value is present; it cannot prove the key works or identify the project's billing tier. “Uji koneksi” and analysis call Google's API only after explicit user consent. Google Free Tier terms state that content may be used to improve Google products. The consent screen discloses this before analysis.
- Gemini CLI is not used: Google announced that individual Free-tier Gemini CLI access moved to Antigravity CLI effective 2026-06-18. Current API Free Tier is the supported path used here.
- **Verified live on 2026-11-17:** a real Google AI Studio Free Tier key was used through the adapter itself (`GeminiProvider`, not a hand-written curl request). `GET /v1beta/models` returned HTTP 200 and listed `models/gemini-3.5-flash-lite`; a real `generateContent` call against that model returned HTTP 200 with `finishReason: STOP`, `serviceTier: standard`, and `modelVersion: gemini-3.5-flash-lite`. The connection test (`testInference`) and a six-section analysis call both succeeded through `GeminiProvider` with the key supplied only as `GEMINI_API_KEY` in the server process environment. The probe was a temporary, uncommitted test file and was deleted afterwards; it is not part of the committed suite.
- **Still NOT verifiable locally:** the key's Google Cloud project billing state. A successful call does not prove the project is on the Free Tier rather than a billed project, and it does not prove remaining quota. A user must confirm this in Google AI Studio.

## 11. Recheck status and what is NOT verified

- Rechecked on 2026-10-24: Claude install commands (PowerShell `irm https://claude.ai/install.ps1 | iex`; macOS/Linux/WSL `curl -fsSL https://claude.ai/install.sh | bash`) against `https://code.claude.com/docs/en/getting-started`; `claude auth login --claudeai` (default is the subscription; `--console` is API billing) and `claude auth status --json` against the installed CLI's own `--help`; Codex `codex login`, `codex login --device-auth` (beta, must be enabled in ChatGPT security settings) and the standalone installer `curl -fsSL https://chatgpt.com/codex/install.sh | sh` against `https://learn.chatgpt.com/docs/auth` and `/docs/codex/cli`; the npm package name `@openai/codex` against a locally installed copy. **Not confirmed from the docs pages:** Windows install steps for Codex (npm is used because the package exists), and the Homebrew cask for Codex (removed from the guide). Claude's own page documents browser login via `claude`; the explicit `claude auth login` subcommand comes from the CLI help. Re-verify before release; these change.
- **NOT RUN:** no real Claude or Codex account was logged in and no real inference was executed in this repository's test runs. The adapters are tested against fake CLIs (`src/test/fake-cli/`) that mimic the documented output shapes: `claude -p --output-format json` result object, `claude auth status --json`, and the Codex app-server JSON-RPC methods (`initialize`, `account/read`, `account/login/start`, thread/turn notifications). The real shapes and the real login flows are therefore unverified here.
- Codex tool restriction is enforced by the client (every server request refused, any tool item aborts the turn) in addition to the read-only/no-network/never-approve thread settings; whether the installed Codex can also disable tool features through configuration was not verified.
- Whether a given subscription plan may be used by a third-party local tool is a provider policy question; SignalForge links the provider's own statements and does not assume permission. Reassess before any hosted or multi-user use.
