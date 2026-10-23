import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import type { DistributionStatus, PlatformId } from '../domain/types';
import { all, get, newId, nowIso, run } from '../db/query';

export interface DistributionRow {
  id: string;
  episodeId: string;
  platformId: PlatformId;
  platformName: string;
  postUrl: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  variantLabel: string | null;
  status: DistributionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DistributionWriteFields {
  platformId: PlatformId;
  status: DistributionStatus;
  postUrl: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  variantLabel: string | null;
}

export interface DistributionListItem extends DistributionRow {
  snapshotCount: number;
  latestCapturedAt: string | null;
}

const DIST_COLUMNS = `
  d.id AS id, d.episode_id AS episodeId, d.platform_id AS platformId, p.name AS platformName,
  d.post_url AS postUrl, d.published_at AS publishedAt, d.external_post_id AS externalPostId,
  d.variant_label AS variantLabel, d.status AS status, d.created_at AS createdAt, d.updated_at AS updatedAt`;

export function insertDistribution(db: DatabaseSync, episodeId: string, f: DistributionWriteFields): string {
  const id = newId();
  const now = nowIso();
  run(
    db,
    `INSERT INTO distributions (id, episode_id, platform_id, post_url, published_at, external_post_id,
       variant_label, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, episodeId, f.platformId, f.postUrl, f.publishedAt, f.externalPostId, f.variantLabel, f.status, now, now],
  );
  return id;
}

export function updateDistributionRow(db: DatabaseSync, id: string, f: DistributionWriteFields): boolean {
  return (
    run(
      db,
      `UPDATE distributions SET platform_id = ?, post_url = ?, published_at = ?, external_post_id = ?,
         variant_label = ?, status = ?, updated_at = ? WHERE id = ?`,
      [f.platformId, f.postUrl, f.publishedAt, f.externalPostId, f.variantLabel, f.status, nowIso(), id],
    ) > 0
  );
}

export function getDistributionRow(db: DatabaseSync, id: string): DistributionRow | undefined {
  return get<DistributionRow>(
    db,
    `SELECT ${DIST_COLUMNS} FROM distributions d JOIN platforms p ON p.id = d.platform_id WHERE d.id = ?`,
    [id],
  );
}

export function listDistributionsForEpisode(db: DatabaseSync, episodeId: string): DistributionListItem[] {
  return all<DistributionListItem>(
    db,
    `SELECT ${DIST_COLUMNS},
       (SELECT COUNT(*) FROM metric_snapshots s WHERE s.distribution_id = d.id) AS snapshotCount,
       (SELECT MAX(s.captured_at) FROM metric_snapshots s WHERE s.distribution_id = d.id) AS latestCapturedAt
     FROM distributions d JOIN platforms p ON p.id = d.platform_id
     WHERE d.episode_id = ?
     ORDER BY p.name COLLATE NOCASE, d.variant_label COLLATE NOCASE, d.created_at`,
    [episodeId],
  ).map((d) => ({ ...d, snapshotCount: Number(d.snapshotCount) }));
}

export function findDuplicateDistributionId(
  db: DatabaseSync,
  episodeId: string,
  platformId: string,
  variantLabel: string | null,
  excludeId?: string,
): string | undefined {
  return get<{ id: string }>(
    db,
    `SELECT id FROM distributions
     WHERE episode_id = ? AND platform_id = ? AND lower(COALESCE(variant_label, '')) = lower(?)
       AND (? IS NULL OR id <> ?)`,
    [episodeId, platformId, variantLabel ?? '', excludeId ?? null, excludeId ?? null],
  )?.id;
}

export function countSnapshotsForDistribution(db: DatabaseSync, id: string): number {
  return Number(
    get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM metric_snapshots WHERE distribution_id = ?', [id])!.n,
  );
}

export function deleteDistributionRow(db: DatabaseSync, id: string): boolean {
  return run(db, 'DELETE FROM distributions WHERE id = ?', [id]) > 0;
}

export function countDistributionsWithoutPublishedAt(db: DatabaseSync): number {
  return Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM distributions WHERE published_at IS NULL')!.n);
}

export function countDistributions(db: DatabaseSync): number {
  return Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM distributions')!.n);
}
