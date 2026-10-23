import type { Migration } from '../migrate';

/**
 * 0003 — metric definitions, append-only snapshots and values.
 * Recovery: additive only. To undo, restore the pre-migration backup in <data dir>/backups/.
 *
 * Integrity (DATA_MODEL §2, ADR 0003):
 *  - metric_values CHECK: value_state='known' needs exactly one of numeric_value/text_value;
 *    every other state requires both to be NULL. Unknown is never stored as 0.
 *  - UPDATE on metric_snapshots/metric_values is blocked by triggers (snapshots are evidence).
 *    Corrections are new snapshots with supersedes_snapshot_id. Rows are only ever removed by
 *    an explicit, confirmed episode/distribution delete (FK cascade).
 *
 * Seeded definitions carry NO source_definition: platform dashboards define these metrics and
 * definitions change over time, so the user records the source definition (UI flags it as missing).
 */
export const migration0003: Migration = {
  version: 3,
  name: 'metrics',
  up: `
CREATE TABLE metric_definitions (
  id TEXT PRIMARY KEY,
  platform_id TEXT REFERENCES platforms(id),          -- NULL = shared definition for all platforms
  key TEXT NOT NULL CHECK (key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*' AND length(key) <= 60),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  unit TEXT NOT NULL CHECK (length(unit) BETWEEN 1 AND 40),
  description TEXT,
  aggregation_kind TEXT NOT NULL CHECK (aggregation_kind IN ('counter','ratio','duration','currency','categorical')),
  currency_code TEXT CHECK (currency_code IS NULL OR (length(currency_code) = 3 AND currency_code NOT GLOB '*[^A-Z]*')),
  allow_negative INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative IN (0,1)),
  source_definition TEXT,
  formula_version TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((aggregation_kind = 'currency') = (currency_code IS NOT NULL))
);
CREATE UNIQUE INDEX metric_definitions_scope_key_idx
  ON metric_definitions (COALESCE(platform_id, ''), key);

CREATE TABLE metric_snapshots (
  id TEXT PRIMARY KEY,
  distribution_id TEXT NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,                          -- UTC ISO-8601
  post_age_seconds INTEGER,                           -- captured_at - published_at at capture time; NULL if unknown
  source TEXT NOT NULL CHECK (source IN ('manual','csv_import','api')),
  note TEXT,
  supersedes_snapshot_id TEXT REFERENCES metric_snapshots(id),
  created_at TEXT NOT NULL
);
CREATE INDEX metric_snapshots_dist_captured_idx ON metric_snapshots (distribution_id, captured_at);

CREATE TABLE metric_values (
  snapshot_id TEXT NOT NULL REFERENCES metric_snapshots(id) ON DELETE CASCADE,
  metric_definition_id TEXT NOT NULL REFERENCES metric_definitions(id),
  numeric_value NUMERIC,
  text_value TEXT,
  value_state TEXT NOT NULL CHECK (value_state IN ('known','unknown','not_available','not_applicable')),
  PRIMARY KEY (snapshot_id, metric_definition_id),
  CHECK (
    (value_state = 'known' AND ((numeric_value IS NOT NULL) + (text_value IS NOT NULL)) = 1)
    OR (value_state <> 'known' AND numeric_value IS NULL AND text_value IS NULL)
  )
);
CREATE INDEX metric_values_def_snapshot_idx ON metric_values (metric_definition_id, snapshot_id);

CREATE TRIGGER metric_snapshots_append_only
  BEFORE UPDATE ON metric_snapshots
  BEGIN SELECT RAISE(ABORT, 'metric_snapshots are append-only'); END;
CREATE TRIGGER metric_values_append_only
  BEFORE UPDATE ON metric_values
  BEGIN SELECT RAISE(ABORT, 'metric_values are append-only'); END;

INSERT INTO metric_definitions
  (id, platform_id, key, label, unit, description, aggregation_kind, allow_negative, created_at, updated_at)
VALUES
  ('mdef_views', NULL, 'views', 'Views', 'views', 'Jumlah tayangan sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_reach', NULL, 'reach', 'Reach', 'accounts', 'Jangkauan akun unik sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_impressions', NULL, 'impressions', 'Impressions', 'impressions', 'Jumlah impresi sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_likes', NULL, 'likes', 'Likes', 'likes', 'Jumlah suka/reaksi sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_comments', NULL, 'comments', 'Comments', 'comments', 'Jumlah komentar sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_shares', NULL, 'shares', 'Shares', 'shares', 'Jumlah bagikan sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_saves', NULL, 'saves', 'Saves', 'saves', 'Jumlah simpan sebagaimana ditampilkan dasbor platform.', 'counter', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_followers_gained', NULL, 'followers_gained', 'Followers gained', 'followers', 'Perubahan pengikut yang dikaitkan platform dengan post ini; bisa negatif.', 'counter', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_watch_time', NULL, 'watch_time_seconds', 'Total watch time', 'seconds', 'Total waktu tonton dalam detik sebagaimana ditampilkan dasbor platform.', 'duration', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_avg_view_duration', NULL, 'average_view_duration_seconds', 'Average view duration', 'seconds', 'Rata-rata durasi tonton dalam detik sebagaimana ditampilkan dasbor platform.', 'duration', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mdef_ctr', NULL, 'click_through_rate', 'Click-through rate', 'ratio', 'Rasio klik terhadap impresi (disimpan sebagai pecahan 0–1, ditampilkan sebagai %).', 'ratio', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`,
};
