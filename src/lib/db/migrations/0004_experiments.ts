import type { Migration } from '../migrate';

/**
 * 0004 — experiments, links to distributions, secondary metrics, and an append-only decision log.
 * Recovery: additive only. To undo, restore the pre-migration backup in <data dir>/backups/.
 *
 * Integrity rules enforced by CHECK so they hold even if application code is bypassed:
 *  - an outcome (decision) exists exactly when status is completed/inconclusive, and a decision of
 *    'inconclusive' exists exactly when status is 'inconclusive' (experiments may be inconclusive);
 *  - finished experiments carry non-empty learning and an end time; running/finished ones a start time;
 *  - success_type is structured (not free prose): 'min_value' (metric units; ratios as fractions) or
 *    'min_relative_gain' (fraction, 0.2 = +20%).
 * Evidence is computed on read from snapshots; nothing stored here claims causality.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'experiments',
  up: `
CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  hypothesis TEXT NOT NULL CHECK (length(trim(hypothesis)) > 0),
  rationale TEXT,
  variable_to_test TEXT NOT NULL CHECK (length(trim(variable_to_test)) > 0),
  target_audience TEXT,
  design TEXT NOT NULL CHECK (design IN ('concurrent','before_after','other')),
  primary_metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id),
  comparison_window_hours INTEGER NOT NULL CHECK (comparison_window_hours > 0),
  comparison_tolerance_hours INTEGER NOT NULL CHECK (comparison_tolerance_hours >= 0),
  success_type TEXT NOT NULL CHECK (success_type IN ('min_value','min_relative_gain')),
  success_value NUMERIC NOT NULL CHECK (success_value >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft','planned','running','completed','inconclusive','cancelled')),
  started_at TEXT,
  ended_at TEXT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep','iterate','reject','inconclusive')),
  learning TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status IN ('completed','inconclusive')) = (decision IS NOT NULL)),
  CHECK ((status = 'inconclusive') = (COALESCE(decision, '') = 'inconclusive')),
  CHECK (status NOT IN ('completed','inconclusive') OR (learning IS NOT NULL AND length(trim(learning)) > 0)),
  CHECK (status NOT IN ('completed','inconclusive','cancelled') OR ended_at IS NOT NULL),
  CHECK (status NOT IN ('running','completed','inconclusive') OR started_at IS NOT NULL)
);
CREATE INDEX experiments_status_idx ON experiments (status, updated_at);

CREATE TABLE experiment_secondary_metrics (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id),
  PRIMARY KEY (experiment_id, metric_definition_id)
);

CREATE TABLE experiment_distributions (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  distribution_id TEXT NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('baseline','variant','supporting')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, distribution_id)
);
CREATE INDEX experiment_distributions_dist_idx ON experiment_distributions (distribution_id, experiment_id);

CREATE TABLE experiment_events (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('created','edited','status','link','unlink','outcome','note')),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX experiment_events_exp_idx ON experiment_events (experiment_id, created_at);

CREATE TRIGGER experiment_events_append_only
  BEFORE UPDATE ON experiment_events
  BEGIN SELECT RAISE(ABORT, 'experiment_events are append-only'); END;
`,
};
