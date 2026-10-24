# ADR 0008: Local AI provider adapters (Claude CLI, Codex app-server)

- Status: Accepted
- Date: 2026-10-24
- Builds on: ADR 0002 (AI provider authentication)

## Context
M7 adds optional AI analysis through the user's own Claude and Codex subscriptions. ADR 0002 forbids token collection and credential scraping. The analysis prompt is analytics-only, so the provider must not get file-system, terminal, web, or MCP capabilities. Provider output is untrusted text.

## Decision
- **One interface, two adapters** (`LocalAiProvider`): `checkHealth` (local only), `testInference` (a real request, consent first), `analyze`, and optional in-app sign-in.
- **Claude** — official Claude Code CLI in print mode: `claude -p --output-format json --tools "" --no-session-persistence --disable-slash-commands`, prompt on stdin, empty temporary working directory. `--bare` is not used because it restricts authentication to an API key and would silently abandon the user's subscription. Sign-in stays in the user's terminal (`claude auth login`); the card shows the official command.
- **Codex** — `codex app-server --listen stdio://` over JSON-RPC. Sign-in is the app-server's own device-code flow (the page host must be https `openai.com`/`chatgpt.com`; the one-time code is shown, never a token). Analysis uses an ephemeral, read-only, no-network, never-approve thread. The client refuses every request from the server and aborts the turn on any tool/command/file/web item; success requires the turn status `completed`.
- **Process rules.** `spawn` with fixed argument arrays and `shell: false`; Windows npm shims are resolved through the known package layout (never parsed or run through a shell); environment **allowlist** (PATH, HOME, temp, proxy, locale, provider home) — API keys and anything token-like are dropped; stdout/stderr capped; timeouts; the whole process tree is killed on timeout, cancel and client disconnect; one call in flight per provider and 12 calls per 10 minutes.
- **Data minimization.** The payload contains aliases (E1, S1), platform, metric definition, window, values (null + reason when unknown), snapshot age and provenance. It never contains scripts, notes, URLs, external ids, episode codes, variant labels, tags or — unless opted in — titles. Payload ≤ 60,000 characters and ≤ 60 posts (truncation is disclosed). The server rebuilds the payload at send time and refuses if its hash differs from what the user reviewed.
- **Output.** At most 12,000 characters, must contain exactly the six sections (Findings, Evidence, Limitations, Hypotheses, Next Experiment, Success Criteria) in order, otherwise it is discarded (`INVALID_RESPONSE`). Citations not present in the sent data are flagged. Rendering uses React elements only (no HTML parsing, no links or images).
- **Errors** are mapped to stable codes (`CLI_NOT_FOUND`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `RATE_LIMITED`, `NETWORK_UNAVAILABLE`, `TIMEOUT`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `CANCELLED`, `BUSY`, `TOOL_USE_BLOCKED`) with a safe message and an operation id; provider text is classified, never displayed or logged.
- **Test mode.** `SIGNALFORGE_AI_MODE=fake` swaps in an in-process provider driven by `<data dir>/fake-ai.json` so the UI can be tested end to end without any CLI, account, or network. It is off unless set explicitly, and the AI pages show a visible "Mode uji" banner while it is on.

## Consequences
The dashboard is fully usable with both providers absent. The adapters depend on CLI behaviour that can change between versions; that output shape is covered only by fake CLIs in tests and **has not been verified against a real logged-in CLI** (see the implementation log). Anthropic and OpenAI usage terms for third-party tools can change and must be rechecked before any use beyond a personal local dashboard.

## Revisit when
A CLI changes its output or flags, a provider offers a documented embedding path for local apps, or the app leaves the single-user local setting.
