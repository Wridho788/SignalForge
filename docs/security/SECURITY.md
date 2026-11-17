# Security and Privacy

## Threat model

The MVP is a single-user local app. The main risks are accidental network exposure, cross-origin requests from malicious web pages, command injection, provider credential leakage, malicious imports, prompt injection in user content, and destructive data loss.

## Required controls

### Local network
- Bind only to `127.0.0.1` by default.
- Reject unexpected Host/Origin values for mutating endpoints; account for legitimate local development origins explicitly.
- Use CSRF protection or a same-origin/session nonce for state-changing operations where appropriate. Loopback alone is not sufficient protection.
- Do not start public listeners or use `0.0.0.0` in the MVP.

### Process execution
- Use fixed executable paths or allowlisted executable resolution and argument arrays.
- Set `shell: false`.
- Never interpolate user-controlled text into shell commands.
- Enforce timeout, cancellation, bounded output, concurrency limits, and child-process cleanup.
- Use a minimal environment allowlist. Avoid inherited secrets where not required.

### Secrets and authentication
- Never persist provider tokens in SQLite, settings, localStorage, URL parameters, logs, screenshots, support bundles, or Git.
- Never ask users to paste access/refresh tokens into the app.
- Do not scrape private credential stores or inspect undocumented auth caches.
- Let official provider tools own credential storage and refresh.
- Gemini API key exception (ADR 0009): read `GEMINI_API_KEY` from the server's temporary OS environment only; never write/persist the key in project `.env` files, return it to the browser, or log it. Setup must not write the key to shell history or project files.
- If a future supported OAuth design needs tokens, use a reviewed secure store and formal threat model.

### Data privacy
- Core data remains local by default.
- AI requests are opt-in and disclose the selected data summary before sending.
- Minimize payloads; exclude scripts, personal notes and post URLs unless explicitly needed and consented to.
- Do not log full prompts or imported records by default.
- Provide export and backup controls with clear destinations.

### Import handling
- Validate file type/size, encoding, columns, timestamps, number ranges and row count.
- Treat all CSV cells as untrusted input. Escape spreadsheet formula prefixes on exports (`=`, `+`, `-`, `@`) where appropriate.
- Preview changes and errors before commit.
- Use parameterized SQL and transactions.
- Do not follow imported file paths or fetch URLs automatically.

### AI prompt injection
- User-provided scripts, titles, notes and imported text are data, not instructions.
- Analytics-only provider calls must not have shell, filesystem or browser tools.
- Never execute model-generated commands or code automatically.
- The model cannot change app settings, delete data, or trigger exports.

### Error handling
- Return stable safe error codes and an operation ID.
- Do not return raw stack traces, stderr, environment variables, token paths or provider auth response bodies.
- Keep detailed logs local and scrubbed.

## Data durability
- Create a backup before restore/destructive migrations.
- Test database backup/restore and CSV round-trip.
- Document where the app stores data and how to remove it.

## Pre-release security checklist
Status at release 0.1.0 (2026-10-24). Items marked [x] were verified by a test or a command recorded in `IMPLEMENTATION_LOG.md`; items marked [~] are partly verified, with the gap stated; [ ] is NOT DONE.
- [x] Server binds to loopback (`dev`/`start` use `-H 127.0.0.1`; listener checked with `Get-NetTCPConnection`).
- [x] Origin/Host/CSRF defenses tested — `src/proxy.ts` + `request-guard` (unit tests and E2E: bad Host → 403, POST without/with foreign/other-port Origin → 403, including `/api/ai/*`). Server Actions also get Next's own Origin-vs-Host check. No CSRF token is used; the guard relies on Origin/Host plus same-origin POST-only actions.
- [x] No token fields (E2E scans the main pages and both AI pages for credential-like inputs). Logging: unexpected errors log only operation id, error name and a message truncated to 200 chars; AI failures log only provider, safe code and operation id — never prompts, answers, or provider text.
- [x] Child process uses `shell: false` and bounded lifecycle — fixed argument arrays, env allowlist (API keys/tokens dropped), stdout/stderr caps, timeouts, process-tree kill on timeout/cancel/disconnect (unit tests with fake CLIs, incl. Windows temp-dir cleanup and crash mid-turn).
- [x] API request and response sizes capped — `/api/ai/*` bodies ≤ 4 KB (413 tested), CSV ≤ 2 MB / 5,000 rows / 5,000 chars per cell, restore file ≤ 25 MB, AI payload ≤ 60,000 chars / 60 posts, AI output ≤ 12,000 chars.
- [x] Rate/concurrency limits for AI requests — one call in flight per provider, 12 per 10 minutes (unit tests).
- [~] Gemini key handling — server-only environment variable, never serialized or logged. Live call verified on 2026-11-17 with a real Free Tier key through the adapter (HTTP 200 from `generateContent` on `gemini-3.5-flash-lite`); the key was supplied only via the server process environment and was never written to a repo file, `.env`, a log, or a browser bundle (repo secret scan clean). Project billing/free-tier entitlement and remaining quota still cannot be verified locally and must be confirmed in Google AI Studio.
- [x] Import/export validated and CSV formula injection mitigated — text cells guarded with a lossless inverse, numbers untouched, errors never echo cell contents (unit + E2E, incl. round-trip).
- [x] AI output rendered without raw HTML execution — React elements only, no links/images; hostile output (`<script>`, `javascript:` link, image) shown as inert text (unit + E2E, no dialog fired).
- [x] Backup/restore tested — consistent backup, validated restore (integrity, schema version, tables, trigger/view allowlist), typed confirmation, rollback on failure, pre-restore backup (unit + E2E).
- [x] No network listeners enabled by default — only the Next.js server on 127.0.0.1; the Codex app-server is used over stdio, never as a listener.
- [~] Provider credentials use documented methods — Claude/Codex official login, Gemini API key supplied through hidden terminal input and server process environment; no credential field or credential-file reads. Gemini API inference **verified live** on 2026-11-17; Claude/Codex live login and inference remain **NOT RUN**.
- [x] Dependency review — `pnpm install --frozen-lockfile` resolved from the lockfile, `pnpm audit --prod` reported "No known vulnerabilities found" on 2026-10-24 (dev dependencies were not audited), and a secret-pattern scan of the repository was clean.
- [ ] Screen-reader and automated axe accessibility audits, and testing in browsers other than Chromium — NOT RUN.
