import 'server-only';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { DistributionStatus, PlatformId, ValueState } from '../domain/types';
import { all, get } from '../db/query';

/** Filters applied to distributions. `publishedFrom`/`publishedBefore` are UTC ISO bounds [from, before). */
export interface DistributionFilter {
  platformId?: PlatformId | null;
  episodeId?: string | null;
  tag?: string | null;
  publishedFrom?: string | null;
  publishedBefore?: string | null;
}

export interface AnalyticsDistributionRow {
  distributionId: string;
  episodeId: string;
  episodeTitle: string;
  episodeCode: string | null;
  platformId: PlatformId;
  platformName: string;
  variantLabel: string | null;
  publishedAt: string | null;
  status: DistributionStatus;
  snapshotCount: number;
}

export interface MetricPointRow {
  distributionId: string;
  snapshotId: string;
  capturedAt: string;
  postAgeSeconds: number | null;
  /** Provenance of the snapshot ('manual' | 'csv_import' | 'api'). */
  source: string;
  state: ValueState | null;
  numericValue: number | null;
}

/** WHERE fragment (static SQL text, bound values) over `distributions d`. */
function filterSql(f: DistributionFilter): { where: string; params: SQLInputValue[] } {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (f.platformId) {
    clauses.push('d.platform_id = ?');
    params.push(f.platformId);
  }
  if (f.episodeId) {
    clauses.push('d.episode_id = ?');
    params.push(f.episodeId);
  }
  if (f.tag) {
    clauses.push(
      `EXISTS (SELECT 1 FROM episode_tags et JOIN tags t ON t.id = et.tag_id WHERE et.episode_id = d.episode_id AND t.name = ?)`,
    );
    params.push(f.tag);
  }
  if (f.publishedFrom) {
    clauses.push('d.published_at >= ?');
    params.push(f.publishedFrom);
  }
  if (f.publishedBefore) {
    clauses.push('d.published_at < ?');
    params.push(f.publishedBefore);
  }
  return { where: clauses.length ? clauses.join(' AND ') : '1 = 1', params };
}

export function listAnalyticsDistributions(db: DatabaseSync, f: DistributionFilter): AnalyticsDistributionRow[] {
  const { where, params } = filterSql(f);
  return all<AnalyticsDistributionRow>(
    db,
    `SELECT d.id AS distributionId, d.episode_id AS episodeId, e.title AS episodeTitle, e.episode_code AS episodeCode,
       d.platform_id AS platformId, p.name AS platformName, d.variant_label AS variantLabel,
       d.published_at AS publishedAt, d.status AS status,
       (SELECT COUNT(*) FROM metric_snapshots s WHERE s.distribution_id = d.id
          AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)) AS snapshotCount
     FROM distributions d
     JOIN episodes e ON e.id = d.episode_id
     JOIN platforms p ON p.id = d.platform_id
     WHERE ${where}
     ORDER BY d.published_at DESC, e.title`,
    params,
  ).map((r) => ({ ...r, snapshotCount: Number(r.snapshotCount) }));
}

/**
 * Readings of one metric for every NON-SUPERSEDED snapshot of the matching distributions.
 * A snapshot with no value row for the metric is returned with `state = null` (unknown).
 */
export function listMetricPoints(db: DatabaseSync, f: DistributionFilter, metricDefinitionId: string): MetricPointRow[] {
  const { where, params } = filterSql(f);
  return all<MetricPointRow>(
    db,
    `SELECT s.distribution_id AS distributionId, s.id AS snapshotId, s.captured_at AS capturedAt,
       s.post_age_seconds AS postAgeSeconds, s.source AS source, v.value_state AS state, v.numeric_value AS numericValue
     FROM metric_snapshots s
     JOIN distributions d ON d.id = s.distribution_id
     LEFT JOIN metric_values v ON v.snapshot_id = s.id AND v.metric_definition_id = ?
     WHERE ${where}
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     ORDER BY s.captured_at ASC, s.created_at ASC`,
    [metricDefinitionId, ...params],
  );
}

/** Same as `listMetricPoints`, for an explicit set of distributions (e.g. those linked to an experiment). */
export function listMetricPointsForDistributions(db: DatabaseSync, distributionIds: string[], metricDefinitionId: string): MetricPointRow[] {
  if (distributionIds.length === 0) return [];
  const placeholders = distributionIds.map(() => '?').join(', '); // only '?' characters are interpolated
  return all<MetricPointRow>(
    db,
    `SELECT s.distribution_id AS distributionId, s.id AS snapshotId, s.captured_at AS capturedAt,
       s.post_age_seconds AS postAgeSeconds, s.source AS source, v.value_state AS state, v.numeric_value AS numericValue
     FROM metric_snapshots s
     LEFT JOIN metric_values v ON v.snapshot_id = s.id AND v.metric_definition_id = ?
     WHERE s.distribution_id IN (${placeholders})
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     ORDER BY s.captured_at ASC, s.created_at ASC`,
    [metricDefinitionId, ...distributionIds],
  );
}

/** Distributions without a published time that the other filters would match (they cannot satisfy a date range). */
export function countUndatedDistributions(db: DatabaseSync, f: DistributionFilter): number {
  const { where, params } = filterSql({ ...f, publishedFrom: null, publishedBefore: null });
  return Number(
    get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM distributions d WHERE ${where} AND d.published_at IS NULL`, params)!.n,
  );
}
