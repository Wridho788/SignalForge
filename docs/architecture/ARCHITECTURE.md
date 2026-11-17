# Architecture

## 1. Architectural principles

- Local-first, single-user, loopback-only for MVP.
- UI and analytics work without AI provider access.
- Persist source facts; derive aggregate analytics from those facts.
- Use append-only metric snapshots to preserve history.
- Provider integration is an adapter behind a stable interface.
- Explicit boundaries: UI → application services → repositories → SQLite; AI requests use a separate provider service.

## 2. Proposed stack

- Next.js App Router + TypeScript.
- React for UI; Tailwind CSS and accessible component primitives.
- SQLite with a migration-capable typed query layer (choose one ORM/query builder after inspecting repo; document the choice in an ADR).
- Zod or equivalent runtime validation for external input/import/API boundaries.
- Vitest or Jest for unit/integration tests; Playwright for browser E2E.
- Node.js runtime for filesystem, SQLite, and provider subprocess integration.

Do not lock exact dependency versions in this planning document. Pin versions in the package manager lockfile after checking current stable releases and compatibility.

## 3. Logical structure

```text
src/
  app/
    (workspace)/
      overview/
      episodes/
      distributions/
      analytics/
      experiments/
      imports/
      settings/
        ai-connections/
    api/
      health/
      analytics/
      imports/
      ai/
  components/
    layout/
    charts/
    forms/
    tables/
    feedback/
  features/
    episodes/
    distributions/
    metrics/
    analytics/
    experiments/
    imports/
    ai-connections/
  lib/
    db/
    repositories/
    validation/
    analytics/
    ai/
    security/
  tests/
```

This is a suggested layout, not a mandate to restructure an existing repository blindly.

### Actual layout (as of M3)

```text
src/
  app/                    routes: / , /episodes[...], /settings[...], /api/health; error/loading/not-found
  proxy.ts                Host/Origin guard (Next 16 `proxy`, replaces middleware)
  components/ui, layout   accessible primitives and app shell
  features/<x>/           'use server' actions (thin: parse → service → redirect) and client forms
  lib/
    db/                   node:sqlite open/pragmas, migrations runner, transactions, query helpers
    repositories/         parameterized SQL only (the only place SQL lives)
    services/             domain rules (duplicates, timezone conversion, snapshot validation/warnings)
    validation/           Zod schemas for every form boundary
    metrics/              pure value parsing/formatting (null ≠ 0)
    security/             request-guard (pure, unit-tested)
    time.ts               UTC storage ↔ selected-timezone parsing/rendering
e2e/                      Playwright (production build, port 3100, isolated data dir)
scripts/e2e-server.mjs    starts the E2E server with a fresh database
```

Layering is enforced by convention and review: pages/actions call services; services call repositories; only repositories contain SQL. Pages that read the database call `await connection()` first (synchronous driver; see ADR 0005).

## 4. Request lifecycle

1. UI sends a typed request to a server route/action.
2. Boundary validation parses input and rejects invalid payloads.
3. Application service enforces domain rules.
4. Repository performs parameterized database access.
5. Service returns typed, minimal output.
6. UI renders accessible feedback and handles loading/error states.

Do not let browser components access SQLite directly. Never accept arbitrary SQL, shell commands, file paths, or provider options from request bodies.

## 5. Local runtime and process boundaries

- Bind web server to `127.0.0.1` by default, not `0.0.0.0`.
- Start AI provider processes only from server-side code with fixed executable and argument lists; do not interpolate user input into shell commands.
- Prefer `spawn` with `shell: false`, bounded stdin/stdout/stderr, timeout, cancellation, and process cleanup.
- Set explicit working directory and minimal environment allowlist.
- Never forward the entire server environment to a provider process without review.
- Keep DB, logs, exports, and backups in an app data directory outside public/static paths.

## 6. AI provider abstraction

Define an internal interface such as:

```ts
interface LocalAiProvider {
  id: 'claude' | 'codex' | 'gemini';
  checkHealth(): Promise<ProviderHealth>;
  analyze(input: AnalysisRequest, options?: { signal?: AbortSignal }): Promise<AnalysisResult>;
}
```

`ProviderHealth` must use states such as `ready`, `not_installed`, `not_authenticated`, `rate_limited`, `unavailable`, and `error`. Do not infer authentication only from executable presence. Health check should distinguish CLI installed from an actual minimal inference check.

Provider adapters must normalize errors into safe categories and never return secrets, local credential paths, raw provider diagnostics, or full process environment.

## 7. Observability

- Log operation id, provider id, duration, outcome category, and truncated non-sensitive diagnostics.
- Do not log full prompts/data by default.
- Do not log authorization headers, token values, auth files, cookies, or full stderr when it may contain secrets.
- Show users actionable errors without exposing implementation details.

## 8. Migrations and backups

- Every schema change has a migration and rollback/recovery note where possible.
- Back up before destructive migrations or restore operations.
- Test upgrade from the previous schema version and export/import round trips.

## 9. Deployment posture

MVP is local-only. Public hosting, multi-user access, remote AI service, and network listeners require a new ADR, authentication/authorization, CSRF/Origin review, rate limits, secret management, data retention plan, and threat-model update.
