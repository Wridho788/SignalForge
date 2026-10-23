import type { Migration } from '../migrate';

/**
 * 0002 — episodes, tags, distributions.
 * Recovery: additive only. To undo, restore the pre-migration backup in <data dir>/backups/.
 * Deleting an episode cascades to its distributions (and, from 0003, their snapshots); the app
 * requires explicit confirmation before doing so.
 */
export const migration0002: Migration = {
  version: 2,
  name: 'content',
  up: `
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  episode_code TEXT COLLATE NOCASE UNIQUE,            -- NULL allowed; unique when present
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  working_title TEXT,
  premise TEXT,
  format TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  script_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
  created_at TEXT NOT NULL
);

CREATE TABLE episode_tags (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (episode_id, tag_id)
);
CREATE INDEX episode_tags_tag_idx ON episode_tags (tag_id, episode_id);

CREATE TABLE distributions (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL REFERENCES platforms(id),
  post_url TEXT,
  published_at TEXT,                                  -- UTC ISO-8601; NULL = unknown
  external_post_id TEXT,
  variant_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived','unknown')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- One distribution per episode+platform unless a distinct variant label is given.
CREATE UNIQUE INDEX distributions_unique_variant_idx
  ON distributions (episode_id, platform_id, lower(COALESCE(variant_label, '')));
CREATE INDEX distributions_platform_published_idx ON distributions (platform_id, published_at);
`,
};
