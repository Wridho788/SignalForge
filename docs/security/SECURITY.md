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
Status after M3 (2026-10-23). Items marked [x] were verified by a test or a command recorded in `IMPLEMENTATION_LOG.md`; the rest are NOT YET DONE and belong to later milestones.
- [x] Server binds to loopback (`dev`/`start` use `-H 127.0.0.1`; listener checked with `Get-NetTCPConnection`).
- [x] Origin/Host/CSRF defenses tested — `src/proxy.ts` + `request-guard` (unit tests and E2E: bad Host → 403, POST without/with foreign/other-port Origin → 403). Server Actions also get Next's own Origin-vs-Host check. No CSRF token is used; the guard relies on Origin/Host plus same-origin POST-only actions.
- [x] No token fields (E2E scans the main pages for credential-like inputs). Logging: unexpected errors log only operation id, error name and a message truncated to 200 chars; no request bodies. AI/token handling does not exist yet (M7).
- [ ] Child process uses `shell: false` and bounded lifecycle.
- [ ] API request and response sizes capped.
- [ ] Rate/concurrency limits for AI requests.
- [ ] Import/export validated and CSV formula injection mitigated.
- [ ] AI output rendered without raw HTML execution.
- [ ] Backup/restore tested.
- [ ] No network listeners enabled by default.
