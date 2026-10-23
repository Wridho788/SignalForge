# ADR 0005: SQLite via `node:sqlite`, hand-written SQL repositories, versioned migrations

- Status: Accepted
- Date: 2026-10-23

## Context
`ARCHITECTURE.md` §2 requires choosing one query layer after inspecting the repo and documenting it. Constraints: single-user local app; small schema; no native build scripts (`allowBuilds` is deny-by-default, ADR 0004); data must be exact (NULL vs 0).

Checked 2026-10-23 on Node v22.13.0: `node:sqlite` is built in (SQLite 3.47.2) and works, but prints an `ExperimentalWarning` and its API may change.

## Decision
- Use the built-in **`node:sqlite`** (`DatabaseSync`) — no native dependency to compile or approve.
- **No ORM.** Repositories are small modules of parameterized SQL (`?` placeholders only; no string-built SQL from input). Services own domain rules; UI/actions never see SQL (AGENTS.md).
- **Zod** validates every external input (forms, later CSV/API) before it reaches services.
- **Migrations** are ordered TypeScript modules (`src/lib/db/migrations/`), applied one transaction each and recorded in `schema_migrations`. A DB newer than the app is refused. Before applying migrations to an existing non-empty DB, the app writes a consistent copy with `VACUUM INTO` to `<data dir>/backups/` (ARCHITECTURE §8).
- IDs are random UUIDs (`crypto.randomUUID()`), stored as TEXT. Timestamps are UTC ISO-8601 strings (`...Z`). `platforms.id` is the stable key (`facebook`, `youtube`, `tiktok`).
- Pragmas on every connection: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout`.
- Next.js: pages that read the DB call `await connection()` first, otherwise synchronous queries run at build/prerender time (Next docs, `connection`).

## Consequences
Positive: no native toolchain, tiny dependency surface, explicit and reviewable SQL, easy to test against `:memory:` or a temp file.
Negative: more hand-written SQL and row mapping than an ORM; `node:sqlite` is experimental (pin Node >= 22.13 in `engines`; re-test on Node upgrades); no automatic migration diffing.

## Revisit when
`node:sqlite` changes incompatibly or is removed, the schema grows enough that an ORM pays for itself, or multi-user/remote storage is required (ADR 0001).
