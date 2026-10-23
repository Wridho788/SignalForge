# AI Connections: Claude and Codex

## 1. UX decision: “Connect account”, not “Get token”

A raw token is a credential, not a normal setup artifact. SignalForge should not ask users to paste access tokens, reveal token values, or attempt to extract tokens from private credential files. Use a button labelled **Connect Claude** / **Connect Codex** or **Sign in via official CLI**. A separate **How to set up** section explains requirements and launches official documentation.

The product may call this page “AI Connections”. A token should only be handled by an official supported auth flow or an explicitly supported secure token exchange; it should not be shown to the user after connection.

## 2. Provider integration choices

### Codex
For a product UI that needs login state, conversation threads, approvals, and streamed events, evaluate the official Codex app-server first. Official documentation describes app-server as the deep-integration interface; Codex SDK is positioned for automating jobs/CI. The app-server supports ChatGPT-managed login flows and account/rate-limit inspection. Verify version-specific schema against the installed Codex CLI because the protocol evolves.

Official references:
- App-server overview/protocol: https://learn.chatgpt.com/docs/app-server
- Sign in with ChatGPT / app-server integration: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
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
- Claude Code setup/authentication: https://docs.anthropic.com/en/docs/claude-code/getting-started
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
  provider: 'claude' | 'codex';
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
