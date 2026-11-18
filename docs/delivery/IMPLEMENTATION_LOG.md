# Implementation Log

Use one entry per development session. Do not backfill imagined progress.

## Template

### YYYY-MM-DD — Short task title
- **Goal:**
- **Changes:**
- **Files:**
- **Tests run:**
- **Results:**
- **Not run / blockers:**
- **Security/data impact:**
- **Docs updated:**
- **Next step:**

## 2026-10-23 — Initial documentation pack
- **Goal:** Establish initial product and engineering source of truth.
- **Changes:** Added PRD, architecture, data model, design research/system, AI connection specification, security policy, test plan, roadmap, and agent instructions.
- **Files:** See repository tree.
- **Tests run:** Documentation/package structure validation only.
- **Results:** Documentation drafted; no application repository was available for implementation verification.
- **Not run / blockers:** No app code compiled, no provider authentication tested, no Playwright suite run.
- **Security/data impact:** Explicitly prohibits token paste/display and requires local-only process boundaries.
- **Docs updated:** This log and all files in the pack.
- **Next step:** Place these docs in the actual repository, inspect existing code, then execute M0 before feature implementation.

## 2026-10-23 — SignalForge rename and M0 repository reconnaissance
- **Goal:** Make all product references consistent with the SignalForge identity, then start M0 (reconnaissance only, no feature work).
- **Changes:** Product name set to `SignalForge` / app name `SignalForge — Content Intelligence`; added tagline, identity table, and Measure → Understand → Experiment → Improve cycle to `README.md`; mapped the cycle to user flows in `PRD.md`; updated Mission in `AGENTS.md`; replaced "the dashboard" with "SignalForge" where it named the product (AI_CONNECTIONS UI copy, ADR 0001); marked M0 IN PROGRESS in `ROADMAP.md`.
- **Reconnaissance findings (verified by inspection, 2026-10-23):**
  - Directory contains only: `AGENTS.md`, `README.md`, `.gitignore`, and 13 files under `docs/`. No `package.json`, lockfile, source, tests, CI config, or `.env.example`.
  - Not a git repository (no `.git`); no history to inspect and no baseline commit.
  - Toolchain on this machine: Node v22.13.0, npm 11.8.0, pnpm 11.9.0, yarn 1.22.22, git 2.47.1; `claude` and `codex` executables are on PATH (presence only; authentication and inference NOT checked).
  - `.gitignore` already covers `node_modules/`, `.next/`, `.env*` (except `.env.example`), SQLite files, and test output.
  - Doc inconsistency noted: ADRs 0001–0003 are still `Proposed`; ADR for ORM/query-builder choice (required by ARCHITECTURE.md §2) does not exist yet.
- **Files:** `README.md`, `AGENTS.md`, `docs/product/PRD.md`, `docs/ai/AI_CONNECTIONS.md`, `docs/adr/0001-local-first-sqlite.md`, `docs/delivery/ROADMAP.md`, `docs/delivery/IMPLEMENTATION_LOG.md`.
- **Tests run:** None. No code exists, so lint/typecheck/unit/E2E are NOT CONFIGURED (no `package.json`).
- **Results:** Documentation-only change; nothing compiled or executed beyond tool-version and file-listing commands.
- **Not run / blockers:** Clean install/build, lint, typecheck, unit and E2E baselines — NOT RUN (no project scaffold yet). Package manager not yet chosen.
- **Security/data impact:** None. No secrets, tokens, or credential stores were read; `claude`/`codex` were only checked for presence on PATH.
- **Docs updated:** As listed under Files.
- **Next step:** Finish M0: decide package manager (pnpm vs npm) and accept ADRs 0001–0003; scaffold Next.js + TypeScript named `signalforge`, bound to `127.0.0.1`; add scripts (`lint`, `typecheck`, `test`, `test:e2e`, `build`), `.env.example`, and record baseline results; write the ORM/query-builder ADR.

## 2026-10-23 — M0 scaffold with pnpm and baseline
- **Goal:** Scaffold the project with pnpm (owner's decision) and establish a lint/typecheck/test/E2E/build baseline.
- **Changes:** Manual scaffold (folder was not empty): Next.js 16.4.2 App Router, React 19.3.1, TypeScript 6.0.3, ESLint 9.39.5 + `eslint-config-next`, Vitest 5.0.5, Playwright 1.64.1. Placeholder home page, `src/lib/identity.ts` with a unit test, one E2E smoke test. Scripts `dev`/`start` bind `-H 127.0.0.1`. Added `.env.example`, ADR 0004, updated `.gitignore`, README run instructions, and QUALITY_GATES commands (npm → pnpm). No database, Zod, or Tailwind yet (M1).
- **Issues found and resolved:**
  1. TypeScript 7.0.2 (latest) broke `pnpm lint`: `typescript-eslint` 8.72 throws "does not support TS 7.0" (peer `<6.1.0`). Pinned TypeScript to 6.0.3 (ADR 0004).
  2. A `pnpm-workspace.yaml`/`pnpm-lock.yaml`/`package.json` exist in `C:\Users\Hp` (pre-existing, from 2026-06-30, for `@anthropic-ai/claude-code`). My first `pnpm add` therefore treated the home directory as the workspace root and wrote to `C:\Users\Hp\pnpm-lock.yaml`, adding this project as an importer there. Fixed for the project by adding a local `pnpm-workspace.yaml` and `turbopack.root`, then reinstalling; the project now has its own `pnpm-lock.yaml`. **The home lockfile was NOT reverted** — it still contains a stale `Documents/example-project/web/signalforge` importer entry (owner decision needed).
  2b. `pnpm peers check` reported unmet peer `eslint` 10 for `eslint-plugin-import`, `jsx-a11y`, and `react`. Pinned ESLint to 9.39.5 (marked deprecated by pnpm); `pnpm peers check` then reported no issues (ADR 0004).
  3. `unrs-resolver` build script left disabled (`allowBuilds: false`); lint, build, and tests pass without it.
  4. `next dev` appended a "nextjs-agent-rules" block to `AGENTS.md` (generated by Next; kept).
- **Tests run (all on this machine, Windows 11, Node 22.13.0, pnpm 11.9.0; final results re-run after the ESLint 9 pin):**
  - `pnpm install` — exit 0 (lockfile up to date)
  - `pnpm lint` — exit 0, no findings
  - `pnpm typecheck` — exit 0
  - `pnpm test` — exit 0, 1 file, 2 tests passed
  - `pnpm build` — exit 0, routes `/` and `/_not-found` static
  - `pnpm test:e2e` — exit 0, 1 test passed (Chromium headless shell, dev server on 127.0.0.1:3000)
  - Loopback check: `next start -H 127.0.0.1 -p 3000` showed a single listener on `127.0.0.1:3000`; process stopped afterwards.
- **Not run / blockers:** Install from a clean clone — NOT RUN (no git repo, so no clean checkout exists). Accessibility/responsive checks — NOT RUN (no real UI yet).- **Security/data impact:** No secrets, tokens, or credential files read or written. `.env.example` contains only non-secret placeholders. Server bound to loopback only. Playwright downloaded Chromium to the user profile cache (`%LOCALAPPDATA%\ms-playwright`).
- **Docs updated:** README, ROADMAP, QUALITY_GATES, ADR 0004, this log.
- **Next step:** Close M0: initialise git and confirm no secrets are tracked, test a clean-clone install, and have the owner accept ADRs 0001–0003. Then M1 (app shell, SQLite, repository layer, health endpoint) — including the ORM/query-builder ADR first.

## 2026-10-23 — M0 close-out, M1 foundation, M2 episodes/distributions, M3 metrics/snapshots
- **Goal:** Close M0 and deliver M1–M3 per `docs/delivery/ROADMAP.md`.
- **Decisions (ADRs):** 0001–0003 accepted (owner instruction to proceed); 0004 pnpm + TypeScript 6.x + ESLint 9.x pins + project-local pnpm root; 0005 `node:sqlite` with hand-written SQL repositories, Zod at boundaries, versioned migrations with pre-migration `VACUUM INTO` backup.
- **Changes:**
  - M0: `git init` (no commits made), `.gitignore`, secret-pattern scan, clean-export verification.
  - M1: Tailwind v4 tokens (contrast verified by test), app shell, accessible form/table/feedback primitives, error/not-found/loading/global-error, settings (timezone, comparison windows), `/api/health`, `src/proxy.ts` Host/Origin guard.
  - M2: episodes (CRUD, tags, search/filter, confirmed cascading delete), distributions for Facebook/YouTube/TikTok (CRUD, duplicate/variant rule, UTC storage with selected-timezone parsing and live preview), episode detail.
  - M3: configurable metric definitions (migration 0003 seeds 11 shared definitions with no source definition), append-only snapshots/values (DB triggers + CHECK), manual entry with per-metric state (value / not available / not applicable; blank = unknown, never stored as 0), warnings requiring confirmation, corrections via superseding snapshots, timeline with gaps, post age, and explicit "no value recorded" list.
- **Files:** see `git ls-files` (124 files). Migrations in `src/lib/db/migrations/`, SQL only in `src/lib/repositories/`, rules in `src/lib/services/`, forms/actions in `src/features/`, specs in `e2e/`.
- **Tests run (Windows 11, Node 22.13.0, pnpm 11.9.0) on the final code, in the working tree AND in a clean export of the staged files (`git checkout-index`, `pnpm install --frozen-lockfile`):**
  - `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm build` exit 0.
  - `pnpm test`: 11 files, 111 tests passed (time zones incl. DST gap/overlap, migrations incl. v2→v3 upgrade and backup, rollback, null-vs-zero parsing/formatting, snapshot rules, append-only triggers, CHECK constraints, cascade delete, request guard, token contrast).
  - `pnpm test:e2e` (production build, port 3100): 31 passed — empty state, health, not-found, validation + input retention, full create→distribution→snapshot flow, zero vs unknown vs N/A, warning confirmation, correction flow, duplicate/variant, unknown published time, timezone change, metric definitions, confirmed deletes, Host/Origin rejection, keyboard-only use, focus visibility, labels, no credential-like inputs, no horizontal overflow at 360/768/1280px.
  - Loopback: `next start -H 127.0.0.1` showed one listener on `127.0.0.1:3000`; `/api/health` OK; process stopped.
  - Visual review: screenshots at 1280px and 360px were viewed by the agent (not by a human designer).
- **Defects found by tests/review and fixed this session:** TS 7 / ESLint 10 incompatibilities (ADR 0004); optional form fields rejected when absent (shared `blankToNull`); duplicate "(halaman saat ini)" nav announcement; page-wide horizontal overflow at 360px caused by `.sr-only` inside a non-positioned scroll container (`TableScroll` is now `relative`); Views column pushed off-screen by alphabetical ordering and empty columns (priority order + columns only for metrics with data); repeated per-row provenance badge (single alert).
- **Not run / limitations:**
  - NOT RUN: screen-reader testing, automated axe-core audit, other browsers than Chromium, `next dev` E2E (only production build), Linux/macOS.
  - HTTP status for missing resources is not asserted (UI is; `loading.tsx` streams before `notFound()`).
  - Not implemented: dark theme/theme setting, demo/seed data, tag rename/delete, metric definition delete (deactivate only), pagination, CSV, manual backup/restore UI, date-range filters (M4+).
  - `node:sqlite` is experimental (warning in server logs); pinned `engines` >= 22.13.
  - ESLint 9.39.5 is marked deprecated by pnpm (ADR 0004).
  - Seeded metric definitions have no `source_definition`; platform metric definitions were deliberately not asserted by the agent.
  - Defaults chosen by the agent, easily changed in Settings: timezone `Asia/Jakarta`; comparison windows 24h±6h and 168h±24h (from DATA_MODEL suggestion).
  - Server Actions are reachable endpoints (single-user local, no auth); protection is the Host/Origin guard + Next's Origin check.
- **Security/data impact:** No secrets or tokens handled; no network calls; post URLs stored as text only and linked only if http(s). Unexpected errors log operation id, error name and truncated message only.
- **Environment note:** `C:\Users\Hp\pnpm-lock.yaml` (pre-existing, owner's) was modified by the first `pnpm add` of this project (stale importer entry for this project). Not reverted; owner decision pending. The project now has its own pnpm root so it no longer touches that file.
- **Docs updated:** README, ROADMAP, DATA_MODEL (§5 as-built), ARCHITECTURE (actual layout), SECURITY (checklist status), QUALITY_GATES (E2E), ADR 0001–0005, this log.
- **Next step:** M4 — analytics dashboard: equivalent-age selection (using `comparison_windows`, excluding superseded snapshots), completeness warnings, filters, sortable table, charts with text alternatives.

## 2026-10-24 — M4 analytics dashboard and M5 experiments
- **Goal:** Deliver M4 (equivalent-age analytics, KPIs, charts, filters, sortable table, episode performance) and M5 (hypothesis/threshold form, links, outcomes, decision log).
- **Decisions:** ADR 0006 (equivalent-age rule; observational experiment evidence). Migration 0004 (experiments). Charts follow the dataviz skill: palette validated with its script (slots 1–3 all-pairs PASS; aqua contrast WARN → table view + visible labels provided), 2px lines, ≥8px markers with surface ring, no interpolation across unknowns, tooltip on hover and keyboard focus, table twin for every chart.
- **Changes:** `/analytics` (metric/window/platform/episode/tag/date filters, basis + data-quality counts, per-platform summaries, trend chart, rankings with sample-size warnings, sortable table with provenance), `/episodes/[id]/performance` (values per window, trend by post age, change between snapshots with baseline rules), Overview KPIs and experiment/decision summary, `/experiments[...]` (create/edit while Draft/Planned, locked once Running, structured success threshold, link baseline/variant/supporting, evidence panel with limitations, outcome form with inconclusive as a valid result, append-only log, confirmed delete for drafts/cancelled).
- **Tests run (Windows 11, Node 22.13.0, pnpm 11.9.0):** `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test` 17 files / 209 tests passed (equivalent-age selection incl. boundaries and ties, change/baseline rules, nulls-last sorting, date range in time zone, platform separation, URL parameter sanitising, chart scales/axes, experiment lifecycle, DB CHECK constraints, evidence per platform); `pnpm test:e2e` (production build): 54 passed (adds analytics and experiments specs, mock data created through the UI).
- **Defects found and fixed:** chart label clipped at the top, single-point chart too tall, mixed hour/day axis ticks ("50 j, 4.2 h"), unreadable charts at 360px (now scroll in a labelled region), row headers misaligned, wrapped dates in tables, duplicate small-sample warnings, redundant nav announcement; several E2E races (reading URLs before redirects).
- **Not run / limitations:** screen reader and axe audit NOT RUN; HTTP 404 status for missing resources is not asserted (loading.tsx streams first); charts are SVG without a charting library (no zoom/brush); experiments cannot be reopened once finished; no randomization support, by design.
- **Docs updated:** ADR 0006, DATA_MODEL §5.1, ROADMAP, this log.
- **Next step:** M6 — CSV import/export and backup/restore.

## 2026-10-24 — M6 import/export/backup, M7 AI Connections, M8 hardening (release 0.1.0)
- **Goal:** Deliver the remaining milestones, plus branding (logo, icons) and a UI/UX/performance pass, within the scope of the docs.
- **Decisions:** ADR 0007 (CSV format v1, import jobs, backup/restore), ADR 0008 (local AI provider adapters). Migration 0005 (`import_jobs`). AI is opt-in per request: consent screen with exact payload, server rebuilds the payload and refuses if its hash changed. `SIGNALFORGE_AI_MODE=fake` (E2E only) swaps in in-process fake providers. Provider singletons are shared through `globalThis`, so errors are recognised by shape (`isAiError`), not `instanceof`.
- **Changes:**
  - M6: `/imports` (template, upload, preview, commit, error report), `/imports/export`, `/imports/backup` (create, download, validated restore with typed confirmation).
  - M7: `src/lib/ai/` (Claude CLI and Codex app-server adapters, env allowlist, bounded process runner, JSON-RPC client, payload/validation, fake provider), `/api/ai/{preview,analyze}`, `/settings/ai-connections` (status, consented connection test, Codex device-code sign-in, setup guide with OS selector and official commands), `/analytics/ai` (consent, cancel, six-section advisory result, alias legend), `SafeMarkdown` (no HTML, no links).
  - Branding/UI: SVG logo mark (`src/components/brand/Logo.tsx`), `icon.svg`, generated `apple-icon`, Lucide icons via `react-icons` (named imports, tree-shaken) in navigation and AI screens, sticky sidebar, per-page enter animation (`template.tsx`, opacity + 4 px, compositor-only, disabled by reduced-motion), button press feedback, overview cycle cards now link to where each stage happens (the four identical "Tersedia" badges were removed).
  - Performance: Settings client bundle no longer pulls zod (constant moved to `settings-limits.ts`): first-load JS for `/settings` 575 KB → 470 KB uncompressed; every other route is 465–490 KB (framework baseline ≈ 465 KB; AI pages add ≈ 20–25 KB). Build warning about PATH-derived paths in `executable.ts` silenced with the documented `turbopackIgnore` marker (they are runtime lookups, not project files).
- **Tests run (Windows 11, Node 22.13.0, pnpm 11.9.0), working tree and again from a clean export of the repository file set (`git ls-files -co --exclude-standard` copied to a temp directory; `pnpm install --frozen-lockfile`):** `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test` 24 files / 386 tests passed; `pnpm test:e2e` (production build, fake AI mode) 80 passed (new: `05-data` CSV/backup/restore, `07-ai` 14 tests: disconnected state, setup guide, consented test, Codex device-code login and cancel, consent payload, opt-in titles, hostile output, unknown references, error codes, cancel, API guards, narrow layouts). `pnpm audit --prod`: no known vulnerabilities. Secret-pattern scan: no matches. Listener check while the E2E server ran: `127.0.0.1:3100` only.
- **Defects found and fixed:** `instanceof AiError` failed across Next.js bundles (provider errors collapsed to `PROVIDER_ERROR`); the fake Claude exposed an in-app login that the real Claude does not have; the analysis page trusted stale cached status after a terminal sign-in (now re-checks local status on open when not connected or older than 5 minutes); hidden radio inputs stacked at one point (now visible native radios); provider card header layout differed between cards; consent heading spacing; a client component imported zod for one constant; Codex Homebrew cask and Claude login command were not confirmed by the docs (cask removed, command confirmed from the installed CLI's `--help`).
- **Not run / limitations:** **NOT RUN:** a real Claude or Codex login and real inference (adapters are verified against fake CLIs and a fake provider; real output shapes may differ); screen-reader and axe audits; browsers other than Chromium; `pnpm audit` for dev dependencies. Codex's ability to disable tool features through configuration is not verified (enforced client-side instead). `node:sqlite` is experimental; ESLint 9 is deprecated upstream (pinned, ADR 0004); `C:\Users\Hp\pnpm-lock.yaml` (outside this project) has a stale importer entry — owner decision. No dark theme, demo data, or tag management.
- **Docs updated:** README (features, data location, CSV/backup/restore, AI, troubleshooting, limitations), ROADMAP, SECURITY checklist, AI_CONNECTIONS §9–10, DATA_MODEL §5.2, QUALITY_GATES, ADR 0007/0008, RELEASE_NOTES.
- **Next step:** Run one real sign-in and a single real analysis per provider by hand (and record the real output shapes), run an axe/screen-reader pass, then decide on 0.2 scope (dark theme, demo data, experiment reopen).

## 2026-11-17 — Gemini Free Tier provider
- **Goal:** Add Gemini as an optional analysis provider while preserving local-first operation, bounded payloads, explicit consent, and no credential field.
- **Changes:** Added a server-only Gemini Developer API adapter pinned to `gemini-3.5-flash-lite` (currently listed as Free Tier), hidden terminal key setup for temporary OS process environment, bounded response handling, safe HTTP error mapping, and a consent warning that Google may use Free Tier prompts/responses to improve products. Added fake mode coverage, adapter/E2E cases, ADR 0009, and setup/privacy documentation. No dependency added; model choice is fixed; no paid-model fallback.
- **Files:** `src/lib/ai/gemini.ts`, `src/lib/ai/gemini.test.ts`, `src/lib/ai/types.ts`, `src/lib/ai/registry.ts`, `src/lib/ai/executable.ts`, `src/lib/ai/fake.ts`, `src/features/ai/{AnalysisPanel,ProviderCard,setup-guide}.tsx/ts`, `src/app/settings/ai-connections/page.tsx`, `e2e/07-ai.spec.ts`, `docs/adr/0009-gemini-developer-api-free-tier.md`, `docs/ai/AI_CONNECTIONS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/security/SECURITY.md`, `docs/delivery/ROADMAP.md`, `README.md`.
- **Tests run:** `pnpm lint` — PASS; `pnpm typecheck` — PASS; `pnpm test` — PASS, 25 files / 390 tests; focused Gemini + AI service tests — PASS, 17 tests; `pnpm test:e2e` — PASS, 81 tests (second invocation continued after Next.js security reminder).
- **Results:** Gemini UI, provider routing, consent disclosure, input minimization, and fake integration pass local automated tests. `git diff --check` — PASS.
- **Not run / blockers:** Real Gemini key and live request — NOT RUN; no key was configured. First `pnpm test:e2e` invocation stopped at the Next build due to a Next.js security vulnerability; retry completed all 81 tests after showing an upgrade reminder. Screen-reader/axe and non-Chromium audits remain NOT RUN.
- **Security/data impact:** Gemini key is not persisted by SignalForge and is only read by the server process from `GEMINI_API_KEY`; no key field, project `.env` instructions, browser exposure, or key logging. Free Tier project/billing state cannot be proven by local status; user must select a no-billing Free Tier project. Data goes to Google only after consent.
- **Docs updated:** README, AI connections guide, ADR 0009, architecture, security checklist, roadmap, and this log.
- **Next step:** Configure a Google AI Studio Free Tier key through the hidden terminal prompt and try one consented request; separately plan the recommended Next.js security upgrade.

## 2026-11-17 — Gemini live verification against the Free Tier
- **Goal:** Replace the previous "NOT RUN" status for Gemini with a real, recorded live call, so the adapter (not just a hand-written request) is proven against Google's API.
- **Changes:** No production code changes to the request path. The response parser was hardened: `thinking` parts are dropped (the model's private reasoning must never reach the user) and a non-`STOP` finish reason is rejected instead of rendering a partial or blocked answer; both rules have new unit tests. A temporary, uncommitted probe test was added, run, and deleted.
- **Findings:** `GET /v1beta/models` with the user's key returned HTTP 200 and listed `models/gemini-3.5-flash-lite` (the model the adapter pins). A real `generateContent` request to that model returned HTTP 200, `finishReason: STOP`, `serviceTier: standard`, `modelVersion: gemini-3.5-flash-lite`. Through `GeminiProvider` itself (key supplied only as `GEMINI_API_KEY` in the server process environment): `checkHealth()` reported `status: connected` with `authenticated: null` (honest — presence of a key is not validity), `testInference()` succeeded, and a six-section analysis call returned valid structured output in ~1.6 s.
- **Files:** `src/lib/ai/gemini.ts` (response parsing hardened), `src/lib/ai/gemini.test.ts` (2 new tests), `docs/ai/AI_CONNECTIONS.md` (§10), `docs/security/SECURITY.md`, `docs/adr/0009-gemini-developer-api-free-tier.md`, `docs/delivery/ROADMAP.md`, `README.md` updated. The probe file `src/lib/ai/gemini.live.test.ts` was deleted and is not committed.
- **Tests run:** `pnpm lint` — PASS; `pnpm typecheck` — PASS; `pnpm test` — 390 passed / 0 failed when run with `--maxWorkers=4 --fileParallelism=false`. The default parallel run (`pnpm test`, 25 workers) fails 4–12 tests by 5 s timeout; the same tests pass in isolation and the identical flakiness reproduces on a clean `git stash` of this branch, so it is pre-existing worker-contention timeout, not a regression from this work. `pnpm test:e2e` — PASS, 81/81 (17.6 min), including the new Gemini Free Tier disclosure spec.
- **Results:** The Gemini Free Tier path is confirmed working end to end through the shipped adapter, including the connection test and the analysis output shape. The response parser was hardened after the live probe: `thinking` parts are dropped so private reasoning cannot reach the user, and a non-`STOP` finish reason (`SAFETY`, `MAX_TOKENS`, `RECITATION`) is rejected instead of rendering a partial or blocked answer. Both rules are covered by new unit tests.
- **Not run / blockers:** The key's Google Cloud project billing state is still not verifiable from the client — a successful call does not prove Free-Tier entitlement rather than a billed project, and it does not prove remaining quota; the user must confirm this in Google AI Studio. Real Claude/Codex login and inference remain NOT RUN. Screen-reader/axe and non-Chromium audits remain NOT RUN.
- **Security/data impact:** The key was used only through the server process environment. It was never written to a repo file, `.env`, a log, or a browser bundle; a repo-wide secret-pattern scan for the key value came back clean. The key was pasted in chat by the owner, so it should be treated as exposed and rotated if that channel is not considered private.
- **Docs updated:** AI connections guide, security checklist, roadmap, README limitations, and this log.
- **Next step:** Confirm in Google AI Studio that the key's project has no paid billing enabled; then decide whether to rotate the key that was shared in chat.

## 2026-11-18 — UI automation + screenshots for the AI feature (fake and live Gemini)
- **Goal:** Produce repeatable UI automation and screenshots of the AI flow (connections page, Gemini setup guide, consent, analysis result) and re-verify the Gemini Free Tier path end to end through the shipped UI, not only through the adapter.
- **Changes:** No production code changes. A temporary Playwright automation script (`scripts/ai-screenshot.mjs`, uncommitted) seeded four demo posts through the UI (YouTube ×2, TikTok, Facebook — one without a snapshot so the "unknown stays null" path is visible), then captured: `/settings/ai-connections`, the Gemini "Cara menyiapkan" panel, `/analytics/ai` provider selection, the consent screen (with the exact payload), and the analysis result. The script was deleted after the run; it is not part of the committed suite.
- **Runs:** (1) Fake mode — production server started with `SIGNALFORGE_AI_MODE=fake` (in-process provider, no network, no credential); the full consent → six-section result flow completed and rendered `Model: fake-model-1`. (2) Live mode — production server started with the key supplied only as `GEMINI_API_KEY` in the server process environment and a separate data directory; the same flow completed against `gemini-3.5-flash-lite` and rendered a real six-section Indonesian analysis (model `gemini-3.5-flash-lite`), including correct handling of the missing Facebook snapshot (value `null`, "Belum ada snapshot") and per-platform separation. Screenshots are kept outside the repository under `.data/screenshots/{fake,live}/` (git-ignored).
- **Tests run (Windows 11, Node 24.22.2, pnpm):** `pnpm test` — PASS, 25 files / 394 tests. `pnpm exec playwright test e2e/07-ai.spec.ts` — PASS, 15/15 (2.5 min, production build, fake AI mode). `pnpm build` — PASS. Lint/typecheck NOT RUN for this entry (no source change; only this log file was edited).
- **Findings / defects:** No product defect found in this session. Two notes for the owner: (a) the live model occasionally renders "MedIAN" (a stray token in the median line of the Findings section) — cosmetic, the response is otherwise valid and passes the six-section validator; (b) `next build` blocks on a Next.js security advisory and only continues on a retry — the recommended upgrade is still pending owner decision (see below).
- **Not run / limitations:** Screen-reader and axe audits NOT RUN; browsers other than Chromium NOT RUN; real Claude/Codex sign-in and inference remain NOT RUN; the key's Google Cloud project billing state and remaining quota are still not verifiable from the client.
- **Security/data impact:** The key was used only through the server process environment of the throwaway test server; it was never written to a repository file, `.env`, a log, or a browser bundle, and the test servers were stopped afterwards. The key was pasted in chat by the owner and must be treated as exposed: rotate it in Google AI Studio after this session.
- **Docs updated:** this log.
- **Next step:** Rotate the Gemini key shared in chat; confirm in Google AI Studio that the key's project has no paid billing; then decide on the recommended Next.js security upgrade (`next upgrade --agent=security`).
