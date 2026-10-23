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
