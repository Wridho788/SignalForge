# ADR 0007: CSV format v1, import jobs, and backup/restore

- Status: Accepted
- Date: 2026-10-24

## Context
M6 needs a lossless way to move snapshot history in and out (CSV) and a way to recover the whole database. The PRD requires that an invalid import can never partially commit silently, that CSV formula injection is mitigated, and that unknown values stay unknown (never 0). The data is local and personal, so a restore must not be able to execute anything or silently destroy the current database.

## Decision
**CSV format v1** (long format, one row per metric value; header is mandatory and versioned by `schema_version`):
`schema_version, episode_code, episode_title, platform, variant_label, published_at, post_url, captured_at, metric_key, value_state, value, unit, note`.
- `value_state` is `known`, `not_available` or `not_applicable`. A blank value for `known` is rejected; an unknown value is simply **absent** (no row). A measured `0` is `known` with `value=0`.
- Ratios are written and read as percentages; counters are integers; negative numbers are accepted only for metrics that allow them.
- Timestamps are ISO-8601 with offset, or local `YYYY-MM-DD HH:mm` interpreted in the Settings time zone.
- Parsing is strict RFC-4180 with hard limits (file ≤ 2 MB, ≤ 5,000 rows, ≤ 5,000 characters per cell). Anything invalid is rejected with a row number and a generic message — error summaries never echo cell contents.
- **Formula-injection guard** applies to *text* cells only (titles, codes, labels, URLs, notes): a cell beginning with `=`, `+`, `-`, `@`, tab, CR or LF is prefixed with `'` on export; a cell that already starts with apostrophes before such a character gets one more, so removing exactly one apostrophe on import is a lossless inverse. Numeric cells are never prefixed, so `-2` stays a number.

**Import jobs.** Upload creates a `previewed` job holding the staged text (nothing else changes). The preview lists valid/rejected rows and what would be created. Commit is one transaction and all-or-nothing: if any row in a snapshot group is invalid the whole group is dropped (a "taint" rule, so partial snapshots are never stored) and the job reports it. Duplicates (same distribution and capture time) follow an explicit policy: `skip`, or `supersede` (new snapshot with `supersedes_snapshot_id`; originals are never edited). After commit, cancel or expiry the staged text is cleared (`content = NULL`). Imported snapshots carry `source='csv_import'` and `import_job_id`; previews not committed within the retention window are expired and their staged text cleared.

**Backup/restore.** A backup is `VACUUM INTO` a new file in `<data dir>/backups/` (consistent even while the app is running). Restore accepts an uploaded `.sqlite` file (≤ 25 MB), stages it under a random name, opens it read-only with `trusted_schema=OFF`, and validates: integrity check, expected schema version, expected tables, and an allowlist of triggers/views (a restored file cannot bring its own code). Only then, after typing the confirmation word `PULIHKAN`, the app creates a pre-restore backup and copies the data table by table inside a single transaction through `ATTACH`. Any failure rolls back and leaves the current database untouched. Staged files (including `-wal`/`-shm`) are removed in every path.

## Consequences
A user can round-trip their data through a spreadsheet without losing the difference between 0 and unknown, and can recover from a bad import or a bad restore. The cost is a stricter format than a free-form CSV and a restore that refuses unfamiliar files. Restoring a database from a *newer* app version is refused rather than guessed.

## Revisit when
Platform exports are imported directly (column mapping), the file limits prove too small for real histories, or multi-user/hosted use is considered (the restore trust model would need review).
