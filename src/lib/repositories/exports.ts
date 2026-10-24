import 'server-only';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AggregationKind, PlatformId, ValueState } from '../domain/types';
import { all } from '../db/query';

export interface ExportRow {
  episodeCode: string | null;
  episodeTitle: string;
  platformId: PlatformId;
  variantLabel: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  capturedAt: string | null;
  note: string | null;
  metricKey: string | null;
  unit: string | null;
  kind: AggregationKind | null;
  state: ValueState | null;
  numericValue: number | null;
  textValue: string | null;
}

export interface ExportFilter {
  platformId?: PlatformId | null;
  episodeId?: string | null;
}

/**
 * One row per measurement of every CURRENT (not superseded) snapshot; a distribution without
 * snapshots yields one structure-only row. Superseded snapshots are history and live in the full backup.
 */
export function listExportRows(db: DatabaseSync, f: ExportFilter = {}): ExportRow[] {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (f.platformId) {
    where.push('d.platform_id = ?');
    params.push(f.platformId);
  }
  if (f.episodeId) {
    where.push('d.episode_id = ?');
    params.push(f.episodeId);
  }
  return all<ExportRow>(
    db,
    `SELECT e.episode_code AS episodeCode, e.title AS episodeTitle, d.platform_id AS platformId,
       d.variant_label AS variantLabel, d.published_at AS publishedAt, d.post_url AS postUrl,
       s.captured_at AS capturedAt, s.note AS note, m.key AS metricKey, m.unit AS unit,
       m.aggregation_kind AS kind, v.value_state AS state, v.numeric_value AS numericValue, v.text_value AS textValue
     FROM distributions d
     JOIN episodes e ON e.id = d.episode_id
     LEFT JOIN metric_snapshots s ON s.distribution_id = d.id
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     LEFT JOIN metric_values v ON v.snapshot_id = s.id
     LEFT JOIN metric_definitions m ON m.id = v.metric_definition_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.title COLLATE NOCASE, e.id, d.platform_id, COALESCE(d.variant_label, '') COLLATE NOCASE, d.id, s.captured_at, m.key`,
    params,
  ).map((r) => ({ ...r, numericValue: r.numericValue === null ? null : Number(r.numericValue) }));
}
