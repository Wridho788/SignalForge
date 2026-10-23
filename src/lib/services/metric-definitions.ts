import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, NotFoundError } from '../domain/errors';
import { isUniqueViolation } from '../db/query';
import {
  findKeyConflict,
  getMetricDefinitionRow,
  insertMetricDefinition,
  listMetricDefinitionRows,
  updateMetricDefinitionRow,
  type MetricDefinitionFilter,
  type MetricDefinitionRow,
} from '../repositories/metric-definitions';
import type { MetricDefinitionCreateInput, MetricDefinitionUpdateInput } from '../validation/metric-definition';

const KEY_TAKEN = 'Kunci metrik sudah dipakai (definisi bersama dan khusus platform berbagi satu ruang kunci).';

export function listMetricDefinitions(db: DatabaseSync, filter: MetricDefinitionFilter = {}): MetricDefinitionRow[] {
  return listMetricDefinitionRows(db, filter);
}

export function getMetricDefinition(db: DatabaseSync, id: string): MetricDefinitionRow {
  const row = getMetricDefinitionRow(db, id);
  if (!row) throw new NotFoundError('Definisi metrik');
  return row;
}

export function createMetricDefinition(db: DatabaseSync, input: MetricDefinitionCreateInput): string {
  if (findKeyConflict(db, input.key, input.platformId)) {
    throw new DomainError(KEY_TAKEN, { key: KEY_TAKEN });
  }
  try {
    return insertMetricDefinition(db, input);
  } catch (error) {
    if (isUniqueViolation(error, 'metric_definitions')) throw new DomainError(KEY_TAKEN, { key: KEY_TAKEN });
    throw error;
  }
}

/**
 * Only descriptive fields and the active flag are editable. Key, platform, kind, unit, currency and
 * sign rules are fixed at creation so stored values keep their meaning; create a new definition
 * (and deactivate the old one) to change them.
 */
export function updateMetricDefinition(db: DatabaseSync, id: string, input: MetricDefinitionUpdateInput): void {
  if (!updateMetricDefinitionRow(db, id, input)) throw new NotFoundError('Definisi metrik');
}
