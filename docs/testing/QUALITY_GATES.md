# Quality Gates and Test Plan

## Definition of Done for each feature

A feature is done only when:
- Acceptance criteria are met.
- Loading, empty, validation, success, and error states are implemented where relevant.
- Types and runtime validation agree.
- Unit/integration tests cover domain behavior and edge cases.
- E2E test covers the critical user path when applicable.
- Accessibility and responsive behavior are checked.
- Security/privacy impact is reviewed.
- Documentation and implementation log are updated.
- The agent reports commands actually run and results honestly.

## Test layers

### Unit tests
- Metric calculations: null vs zero, percent change baseline zero, equivalent-age selection, unit mismatch.
- Validation: timestamp, metric unit, duplicate records, import rows, experiment status transitions.
- AI payload builder: minimizes data, preserves nulls, includes provenance, omits excluded fields.
- Provider error mapping and safe display message.

### Integration tests
- Repositories with temporary SQLite database.
- Migrations from empty DB and previous schema.
- Transaction rollback on partial import failure.
- CSV import preview/commit and export/import round trip.
- Provider adapters with fake child process/SDK; never require real subscription login in CI.
- Timeout, cancellation, process exit, malformed JSON-RPC/SDK output, rate-limit and auth errors.

### E2E tests (Playwright)
1. Empty app → create episode → add distribution → add snapshot.
2. Add multiple snapshots → view equivalent-age analytics and data-quality warning.
3. Filter by platform/date/tag and open episode detail.
4. Create experiment → link distribution → record outcome.
5. Import invalid CSV → see row errors → ensure no partial commit.
6. Export data and verify expected columns.
7. AI Connections page shows disconnected state and core app still works.
8. Fake provider success and failure paths; ensure no token value is rendered.
9. Keyboard navigation through sidebar, dialogs, filters and forms.
10. Test responsive widths 360px, 768px, 1280px.

## Commands
The package manager is pnpm (ADR 0004). Scripts are defined in `package.json`:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e   # first run: pnpm exec playwright install chromium
pnpm build
```

`pnpm test:e2e` runs `pnpm build` and then serves the production build on `127.0.0.1:3100` with a fresh database in `.data/e2e` (see `scripts/e2e-server.mjs`). It writes to `.next`, so stop `pnpm dev` first. Spec files are numbered because they share one database and run in order (`01-smoke`, `02-flow`, `03-security-a11y`).

Do not add scripts blindly; inspect `package.json` first and document the actual project commands. If a command is absent, record NOT CONFIGURED and add it in the setup milestone.

## Test data
- Include records with missing snapshots, zero views, missing published_at, multiple platforms, irregular snapshot ages, and different metric definitions.
- Seed/demo data must be clearly marked and never be mixed with real data silently.
- No real tokens or personal credentials in fixtures.

## Release gates

### Gate A — Foundation
- Lint, typecheck, unit tests pass.
- Migrations run on empty DB and upgrade path.

### Gate B — Data correctness
- Null/zero semantics verified end-to-end.
- Import/export round-trip verified.
- Analytics calculation tests pass.

### Gate C — AI integration
- Both providers can be disconnected without breaking core flows.
- Success, auth-required, timeout, rate-limit, malformed response, and process exit are covered.
- No secrets in logs/responses/UI.

### Gate D — MVP release
- Full E2E suite passes.
- Responsive and accessibility smoke tests completed.
- Backup/restore test completed.
- README, setup instructions, limitations, and recovery procedure are current.
