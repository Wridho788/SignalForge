import 'server-only';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { all, get, likePattern, newId, nowIso, run } from '../db/query';

export interface EpisodeRow {
  id: string;
  episodeCode: string | null;
  title: string;
  workingTitle: string | null;
  premise: string | null;
  format: string | null;
  durationSeconds: number | null;
  scriptText: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeWriteFields {
  episodeCode: string | null;
  title: string;
  workingTitle: string | null;
  premise: string | null;
  format: string | null;
  durationSeconds: number | null;
  scriptText: string | null;
  notes: string | null;
}

export interface EpisodeListItem extends EpisodeRow {
  tags: string[];
  distributionCount: number;
  snapshotCount: number;
}

const EPISODE_COLUMNS = `
  e.id AS id, e.episode_code AS episodeCode, e.title AS title, e.working_title AS workingTitle,
  e.premise AS premise, e.format AS format, e.duration_seconds AS durationSeconds,
  e.script_text AS scriptText, e.notes AS notes, e.created_at AS createdAt, e.updated_at AS updatedAt`;

export function insertEpisode(db: DatabaseSync, f: EpisodeWriteFields): string {
  const id = newId();
  const now = nowIso();
  run(
    db,
    `INSERT INTO episodes (id, episode_code, title, working_title, premise, format, duration_seconds,
       script_text, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, f.episodeCode, f.title, f.workingTitle, f.premise, f.format, f.durationSeconds, f.scriptText, f.notes, now, now],
  );
  return id;
}

export function updateEpisodeRow(db: DatabaseSync, id: string, f: EpisodeWriteFields): boolean {
  return (
    run(
      db,
      `UPDATE episodes SET episode_code = ?, title = ?, working_title = ?, premise = ?, format = ?,
         duration_seconds = ?, script_text = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [f.episodeCode, f.title, f.workingTitle, f.premise, f.format, f.durationSeconds, f.scriptText, f.notes, nowIso(), id],
    ) > 0
  );
}

export function touchEpisode(db: DatabaseSync, id: string): void {
  run(db, 'UPDATE episodes SET updated_at = ? WHERE id = ?', [nowIso(), id]);
}

export function getEpisodeRow(db: DatabaseSync, id: string): EpisodeRow | undefined {
  return get<EpisodeRow>(db, `SELECT ${EPISODE_COLUMNS} FROM episodes e WHERE e.id = ?`, [id]);
}

export function findEpisodeIdByCode(db: DatabaseSync, code: string): string | undefined {
  return get<{ id: string }>(db, 'SELECT id FROM episodes WHERE episode_code = ?', [code])?.id;
}

/** Case-insensitive exact title matches (ids), used to match imported rows without an episode code. */
export function findEpisodeIdsByTitle(db: DatabaseSync, title: string): string[] {
  return all<{ id: string }>(db, 'SELECT id FROM episodes WHERE lower(title) = lower(?) ORDER BY created_at', [title]).map((r) => r.id);
}

export function deleteEpisodeRow(db: DatabaseSync, id: string): boolean {
  return run(db, 'DELETE FROM episodes WHERE id = ?', [id]) > 0;
}

export interface EpisodeFilter {
  q?: string | null;
  tag?: string | null;
}

export function listEpisodeRows(db: DatabaseSync, filter: EpisodeFilter = {}): EpisodeListItem[] {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.q) {
    const pattern = likePattern(filter.q);
    where.push(
      `(e.title LIKE ? ESCAPE '\\' OR e.working_title LIKE ? ESCAPE '\\' OR e.episode_code LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern);
  }
  if (filter.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM episode_tags et JOIN tags t ON t.id = et.tag_id WHERE et.episode_id = e.id AND t.name = ?)`,
    );
    params.push(filter.tag);
  }
  const rows = all<EpisodeRow & { tagList: string | null; distributionCount: number; snapshotCount: number }>(
    db,
    `SELECT ${EPISODE_COLUMNS},
       (SELECT group_concat(t.name, char(31)) FROM episode_tags et JOIN tags t ON t.id = et.tag_id
          WHERE et.episode_id = e.id) AS tagList,
       (SELECT COUNT(*) FROM distributions d WHERE d.episode_id = e.id) AS distributionCount,
       (SELECT COUNT(*) FROM metric_snapshots s JOIN distributions d ON d.id = s.distribution_id
          WHERE d.episode_id = e.id) AS snapshotCount
     FROM episodes e
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.updated_at DESC, e.title ASC`,
    params,
  );
  return rows.map(({ tagList, ...rest }) => ({
    ...rest,
    tags: tagList ? tagList.split('\u001f').sort((a, b) => a.localeCompare(b)) : [],
    distributionCount: Number(rest.distributionCount),
    snapshotCount: Number(rest.snapshotCount),
  }));
}

export function countEpisodes(db: DatabaseSync): number {
  return Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM episodes')!.n);
}

// --- tags ---

export interface TagUsage {
  name: string;
  episodeCount: number;
}

export function listTagUsage(db: DatabaseSync): TagUsage[] {
  return all<TagUsage>(
    db,
    `SELECT t.name AS name, COUNT(et.episode_id) AS episodeCount
     FROM tags t LEFT JOIN episode_tags et ON et.tag_id = t.id
     GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
  ).map((t) => ({ ...t, episodeCount: Number(t.episodeCount) }));
}

export function getEpisodeTagNames(db: DatabaseSync, episodeId: string): string[] {
  return all<{ name: string }>(
    db,
    `SELECT t.name AS name FROM episode_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.episode_id = ? ORDER BY t.name COLLATE NOCASE`,
    [episodeId],
  ).map((r) => r.name);
}

/** Replaces the episode's tag links; creates missing tags (names are case-insensitive unique). */
export function replaceEpisodeTags(db: DatabaseSync, episodeId: string, names: string[]): void {
  run(db, 'DELETE FROM episode_tags WHERE episode_id = ?', [episodeId]);
  for (const name of names) {
    let tagId = get<{ id: string }>(db, 'SELECT id FROM tags WHERE name = ?', [name])?.id;
    if (!tagId) {
      tagId = newId();
      run(db, 'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [tagId, name, nowIso()]);
    }
    run(db, 'INSERT OR IGNORE INTO episode_tags (episode_id, tag_id) VALUES (?, ?)', [episodeId, tagId]);
  }
  deleteOrphanTags(db);
}

/** Tags no longer used by any episode are removed so suggestions stay relevant. */
export function deleteOrphanTags(db: DatabaseSync): void {
  run(db, 'DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM episode_tags)');
}
