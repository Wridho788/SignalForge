# ADR 0004: pnpm as package manager; TypeScript pinned to 6.x; project-local pnpm root

- Status: Accepted (package manager chosen by the project owner on 2026-10-23)
- Date: 2026-10-23

## Context
M0 needs a package manager and a reproducible install. Checked on 2026-10-23: `pnpm view` reported TypeScript 7.0.2 as latest, but `typescript-eslint` 8.72 (pulled in by `eslint-config-next`) rejects TypeScript 7.0 at load time and declares a peer range of `>=4.8.4 <6.1.0`, so `pnpm lint` failed. Separately, a `pnpm-workspace.yaml` exists in the developer's home directory, which made pnpm treat that directory as the workspace root and write the lockfile there instead of in this project.

## Decision
- Use **pnpm** (v11 at time of writing). Commit `pnpm-lock.yaml`. Scripts are defined in `package.json`; CI and docs call them via `pnpm <script>`.
- Pin TypeScript to the **6.x** line (`^6.0.3`) until `typescript-eslint` supports a newer major. Revisit when it does (tracking: typescript-eslint issue #10940).
- Pin ESLint to the **9.x** line (`^9`). `pnpm peers check` showed `eslint-plugin-import`, `jsx-a11y`, and `react` (bundled by `eslint-config-next`) do not declare ESLint 10 support; on 9.x it reports no peer issues. pnpm marks ESLint 9.39.5 as deprecated, which is an accepted trade-off until `eslint-config-next` supports ESLint 10.
- Keep a `pnpm-workspace.yaml` in the project root (`packages: []`) so this folder is always its own pnpm root, and set `turbopack.root` in `next.config.ts` for the same reason.
- Do not run dependency build scripts by default: `allowBuilds` lists `unrs-resolver: false`. Lint, typecheck, unit, E2E, and build were verified without it. Enable a build script only with a recorded reason.

## Consequences
Positive: reproducible installs from a project-local lockfile; lint works; parent-directory tooling cannot leak into the project.
Negative: TypeScript lags the latest major; `allowBuilds` entries need review when dependencies change.

## Revisit when
`typescript-eslint` supports TypeScript 7.x, or the package manager changes.
