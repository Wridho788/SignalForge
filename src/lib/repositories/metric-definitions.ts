import 'server-only';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AggregationKind } from '../domain/types';
import { all, get, newId, nowIso, run } from '../db/query';
import { compareMetricDefinitions } from '../metrics/order';

export interface MetricDefinitionRow {
  id: string;
  platformId: string | null;
  platformName: string | null;
  key: string;
  label: string;
  unit: string;
  description: string | null;
  aggregationKind: AggregationKind;
  currencyCode: string | null;
  allowNegative: boolean;
  sourceDefinition: string | null;
  formulaVersion: string | null;
  isActive: boolean;
  valueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MetricDefinitionCreateFields {
  platformId: string | null;
  key: string;
  label: string;
  unit: string;
  description: string | null;
  aggregationKind: AggregationKind;
  currencyCode: string | null;
  allowNegative: boolean;
  sourceDefinition: string | null;
  formulaVersion: string | null;
}

export interface MetricDefinitionUpdateFields {
  label: string;
  description: string | null;
  sourceDefinition: string | null;
  formulaVersion: string | null;
  isActive: boolean;
}

const COLUMNS = `
  m.id AS id, m.platform_id AS platformId, p.name AS platformName, m.key AS key, m.label AS label,
  m.unit AS unit, m.description AS description, m.aggregation_kind AS aggregationKind,
  m.currency_code AS currencyCode, m.allow_negative AS allowNegative,
  m.source_definition AS sourceDefinition, m.formula_version AS formulaVersion,
  m.is_active AS isActive, m.created_at AS createdAt, m.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM metric_values v WHERE v.metric_definition_id = m.id) AS valueCount`;

type Raw = Omit<MetricDefinitionRow, 'allowNegative' | 'isActive' | 'valueCount'> & {
  allowNegative: number;
  isActive: number;
  valueCount: number;
};

const map = (r: Raw): MetricDefinitionRow => ({
  ...r,
  allowNegative: r.allowNegative === 1,
  isActive: r.isActive === 1,
  valueCount: Number(r.valueCount),
});

export interface MetricDefinitionFilter {
  /** Only definitions that apply to this platform (shared + platform-specific). */
  applicableTo?: string;
  activeOnly?: boolean;
}

export function listMetricDefinitionRows(db: DatabaseSync, filter: MetricDefinitionFilter = {}): MetricDefinitionRow[] {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.applicableTo) {
    where.push('(m.platform_id IS NULL OR m.platform_id = ?)');
    params.push(filter.applicableTo);
  }
  if (filter.activeOnly) where.push('m.is_active = 1');
  return all<Raw>(
    db,
    `SELECT ${COLUMNS} FROM metric_definitions m LEFT JOIN platforms p ON p.id = m.platform_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params,
  )
    .map(map)
    .sort(compareMetricDefinitions);
}

export function getMetricDefinitionRow(db: DatabaseSync, id: string): MetricDefinitionRow | undefined {
  const row = get<Raw>(
    db,
    `SELECT ${COLUMNS} FROM metric_definitions m LEFT JOIN platforms p ON p.id = m.platform_id WHERE m.id = ?`,
    [id],
  );
  return row ? map(row) : undefined;
}

/** A key clashes if a shared definition has it, the new one is shared and any scope has it, or the same platform has it. */
export function findKeyConflict(db: DatabaseSync, key: string, platformId: string | null): string | undefined {
  return get<{ id: string }>(
    db,
    `SELECT id FROM metric_definitions
     WHERE key = ? AND (platform_id IS NULL OR ? IS NULL OR platform_id = ?)`,
    [key, platformId, platformId],
  )?.id;
}

export function insertMetricDefinition(db: DatabaseSync, f: MetricDefinitionCreateFields): string {
  const id = newId();
  const now = nowIso();
  run(
    db,
    `INSERT INTO metric_definitions (id, platform_id, key, label, unit, description, aggregation_kind,
       currency_code, allow_negative, source_definition, formula_version, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [
      id,
      f.platformId,
      f.key,
      f.label,
      f.unit,
      f.description,
      f.aggregationKind,
      f.currencyCode,
      f.allowNegative ? 1 : 0,
      f.sourceDefinition,
      f.formulaVersion,
      now,
      now,
    ],
  );
  return id;
}

export function updateMetricDefinitionRow(db: DatabaseSync, id: string, f: MetricDefinitionUpdateFields): boolean {
  return (
    run(
      db,
      `UPDATE metric_definitions SET label = ?, description = ?, source_definition = ?, formula_version = ?,
         is_active = ?, updated_at = ? WHERE id = ?`,
      [f.label, f.description, f.sourceDefinition, f.formulaVersion, f.isActive ? 1 : 0, nowIso(), id],
    ) > 0
  );
}
