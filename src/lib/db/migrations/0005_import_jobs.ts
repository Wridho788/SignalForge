import type { Migration } from '../migrate';

/**
 * 0005 — CSV import jobs (DATA_MODEL: import_jobs) and import provenance on snapshots.
 * Recovery: additive only (a nullable column and a table). To undo, restore the pre-migration
 * backup in <data dir>/backups/.
 *
 * `content` holds the staged CSV text only while a job is 'previewed'; it is set to NULL when the
 * job is committed, cancelled or expires, so imported records are not retained. `error_summary`
 * stores row numbers and generic messages, never cell contents.
 */
export const migration0005: Migration = {
  version: 5,
  name: 'import_jobs',
  up: `
CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK (status IN ('previewed','committed','failed','cancelled')),
  duplicate_policy TEXT CHECK (duplicate_policy IS NULL OR duplicate_policy IN ('skip','supersede')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
  rows_valid INTEGER NOT NULL DEFAULT 0 CHECK (rows_valid >= 0),
  rows_rejected INTEGER NOT NULL DEFAULT 0 CHECK (rows_rejected >= 0),
  snapshots_created INTEGER NOT NULL DEFAULT 0 CHECK (snapshots_created >= 0),
  error_summary TEXT,
  content TEXT
);
CREATE INDEX import_jobs_started_idx ON import_jobs (started_at);

-- NULL for manual snapshots. (A nullable column with REFERENCES is allowed by ALTER TABLE.)
ALTER TABLE metric_snapshots ADD COLUMN import_job_id TEXT REFERENCES import_jobs(id);
`,
};
