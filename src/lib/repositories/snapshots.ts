import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import type { ValueState } from '../domain/types';
import { all, get, newId, nowIso, run } from '../db/query';

// Snapshots and their values are append-only evidence (DATA_MODEL §2). This module deliberately
// exposes no update or delete; the schema also blocks UPDATEs with triggers.

export interface SnapshotRow {
  id: string;
  distributionId: string;
  capturedAt: string;
  postAgeSeconds: number | null;
  source: 'manual' | 'csv_import' | 'api';
  note: string | null;
  supersedesSnapshotId: string | null;
  createdAt: string;
}

export interface SnapshotValueRow {
  snapshotId: string;
  metricDefinitionId: string;
  numericValue: number | null;
  textValue: string | null;
  valueState: ValueState;
}

export interface SnapshotInsertFields {
  distributionId: string;
  capturedAt: string;
  postAgeSeconds: number | null;
  source: SnapshotRow['source'];
  note: string | null;
  supersedesSnapshotId: string | null;
  /** Set for snapshots created by a CSV import (provenance). */
  importJobId?: string | null;
}

const SNAPSHOT_COLUMNS = `
  s.id AS id, s.distribution_id AS distributionId, s.captured_at AS capturedAt,
  s.post_age_seconds AS postAgeSeconds, s.source AS source, s.note AS note,
  s.supersedes_snapshot_id AS supersedesSnapshotId, s.created_at AS createdAt`;

export function insertSnapshot(db: DatabaseSync, f: SnapshotInsertFields): string {
  const id = newId();
  run(
    db,
    `INSERT INTO metric_snapshots (id, distribution_id, captured_at, post_age_seconds, source, note,
       supersedes_snapshot_id, import_job_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, f.distributionId, f.capturedAt, f.postAgeSeconds, f.source, f.note, f.supersedesSnapshotId, f.importJobId ?? null, nowIso()],
  );
  return id;
}

export function insertSnapshotValue(db: DatabaseSync, v: SnapshotValueRow): void {
  run(
    db,
    `INSERT INTO metric_values (snapshot_id, metric_definition_id, numeric_value, text_value, value_state)
     VALUES (?,?,?,?,?)`,
    [v.snapshotId, v.metricDefinitionId, v.numericValue, v.textValue, v.valueState],
  );
}

export function getSnapshotRow(db: DatabaseSync, id: string): SnapshotRow | undefined {
  return get<SnapshotRow>(db, `SELECT ${SNAPSHOT_COLUMNS} FROM metric_snapshots s WHERE s.id = ?`, [id]);
}

/** Oldest first. */
export function listSnapshotRows(db: DatabaseSync, distributionId: string): SnapshotRow[] {
  return all<SnapshotRow>(
    db,
    `SELECT ${SNAPSHOT_COLUMNS} FROM metric_snapshots s WHERE s.distribution_id = ?
     ORDER BY s.captured_at ASC, s.created_at ASC`,
    [distributionId],
  );
}

export function listValueRowsForDistribution(db: DatabaseSync, distributionId: string): SnapshotValueRow[] {
  return all<SnapshotValueRow>(
    db,
    `SELECT v.snapshot_id AS snapshotId, v.metric_definition_id AS metricDefinitionId,
       v.numeric_value AS numericValue, v.text_value AS textValue, v.value_state AS valueState
     FROM metric_values v JOIN metric_snapshots s ON s.id = v.snapshot_id
     WHERE s.distribution_id = ?`,
    [distributionId],
  );
}

/** IDs of snapshots that a later snapshot replaces (supersedes_snapshot_id points at them). */
export function listSupersededSnapshotIds(db: DatabaseSync, distributionId: string): Map<string, string> {
  const rows = all<{ oldId: string; newId: string }>(
    db,
    `SELECT s.supersedes_snapshot_id AS oldId, s.id AS newId FROM metric_snapshots s
     WHERE s.distribution_id = ? AND s.supersedes_snapshot_id IS NOT NULL`,
    [distributionId],
  );
  return new Map(rows.map((r) => [r.oldId, r.newId]));
}

export interface NeighborKnownValue {
  capturedAt: string;
  value: number;
}

/** Closest known numeric value for a metric strictly before `capturedAt` (ignoring superseded snapshots). */
export function previousKnownValue(
  db: DatabaseSync,
  distributionId: string,
  metricDefinitionId: string,
  capturedAt: string,
  excludeSnapshotId: string | null = null,
): NeighborKnownValue | undefined {
  return get<NeighborKnownValue>(
    db,
    `SELECT s.captured_at AS capturedAt, v.numeric_value AS value
     FROM metric_values v JOIN metric_snapshots s ON s.id = v.snapshot_id
     WHERE s.distribution_id = ? AND v.metric_definition_id = ? AND v.value_state = 'known'
       AND v.numeric_value IS NOT NULL AND s.captured_at < ?
       AND (? IS NULL OR s.id <> ?)
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     ORDER BY s.captured_at DESC LIMIT 1`,
    [distributionId, metricDefinitionId, capturedAt, excludeSnapshotId, excludeSnapshotId],
  );
}

/** Closest known numeric value for a metric strictly after `capturedAt` (ignoring superseded snapshots). */
export function nextKnownValue(
  db: DatabaseSync,
  distributionId: string,
  metricDefinitionId: string,
  capturedAt: string,
  excludeSnapshotId: string | null = null,
): NeighborKnownValue | undefined {
  return get<NeighborKnownValue>(
    db,
    `SELECT s.captured_at AS capturedAt, v.numeric_value AS value
     FROM metric_values v JOIN metric_snapshots s ON s.id = v.snapshot_id
     WHERE s.distribution_id = ? AND v.metric_definition_id = ? AND v.value_state = 'known'
       AND v.numeric_value IS NOT NULL AND s.captured_at > ?
       AND (? IS NULL OR s.id <> ?)
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     ORDER BY s.captured_at ASC LIMIT 1`,
    [distributionId, metricDefinitionId, capturedAt, excludeSnapshotId, excludeSnapshotId],
  );
}

export function hasSnapshotAt(
  db: DatabaseSync,
  distributionId: string,
  capturedAt: string,
  excludeSnapshotId: string | null = null,
): boolean {
  return (
    get<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM metric_snapshots
       WHERE distribution_id = ? AND captured_at = ? AND (? IS NULL OR id <> ?)`,
      [distributionId, capturedAt, excludeSnapshotId, excludeSnapshotId],
    )!.n > 0
  );
}

/** The current (not superseded) snapshot of a distribution captured at exactly this instant, if any. */
export function findCurrentSnapshotAt(db: DatabaseSync, distributionId: string, capturedAt: string): string | undefined {
  return get<{ id: string }>(
    db,
    `SELECT s.id AS id FROM metric_snapshots s
     WHERE s.distribution_id = ? AND s.captured_at = ?
       AND NOT EXISTS (SELECT 1 FROM metric_snapshots r WHERE r.supersedes_snapshot_id = s.id)
     ORDER BY s.created_at DESC LIMIT 1`,
    [distributionId, capturedAt],
  )?.id;
}

export function countSnapshotsForEpisode(db: DatabaseSync, episodeId: string): number {
  return Number(
    get<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM metric_snapshots s JOIN distributions d ON d.id = s.distribution_id
       WHERE d.episode_id = ?`,
      [episodeId],
    )!.n,
  );
}

export function countSnapshots(db: DatabaseSync): number {
  return Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM metric_snapshots')!.n);
}

export function countDistributionsWithoutSnapshots(db: DatabaseSync): number {
  return Number(
    get<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM distributions d
       WHERE NOT EXISTS (SELECT 1 FROM metric_snapshots s WHERE s.distribution_id = d.id)`,
    )!.n,
  );
}
