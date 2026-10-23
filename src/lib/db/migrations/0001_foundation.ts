import type { Migration } from '../migrate';

/**
 * 0001 — settings and platforms.
 * Recovery: additive only. To undo, restore the pre-migration backup in <data dir>/backups/.
 */
export const migration0001: Migration = {
  version: 1,
  name: 'foundation',
  up: `
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- id is the stable internal key; name is the human-readable label.
CREATE TABLE platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO platforms (id, name) VALUES
  ('facebook', 'Facebook'),
  ('youtube', 'YouTube'),
  ('tiktok', 'TikTok');
`,
};
