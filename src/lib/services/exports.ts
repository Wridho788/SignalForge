import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { guardFormula, toCsv } from '../csv/csv';
import { CSV_COLUMNS, CSV_SCHEMA_VERSION, TEMPLATE_ROWS } from '../csv/format';
import { listExportRows, type ExportFilter, type ExportRow } from '../repositories/exports';

/** Percent without float noise: 0.045 → "4.5". */
function ratioToPercent(fraction: number): string {
  return String(Number((fraction * 100).toFixed(8)));
}

function valueCell(r: ExportRow): string {
  if (r.state !== 'known') return '';
  if (r.kind === 'categorical') return guardFormula(r.textValue ?? '');
  if (r.numericValue === null) return '';
  // Numeric cells are NOT formula-guarded: "-5" must stay "-5" (SECURITY: only text cells are escaped).
  return r.kind === 'ratio' ? ratioToPercent(r.numericValue) : String(r.numericValue);
}

/**
 * Export in CSV format v1 (the same format the importer reads, so export → import round-trips).
 * Text cells are protected against spreadsheet formulas; numbers are written as plain decimals with a dot.
 */
export function exportSnapshotsCsv(db: DatabaseSync, filter: ExportFilter = {}): string {
  const rows = listExportRows(db, filter).map((r) => [
    CSV_SCHEMA_VERSION,
    guardFormula(r.episodeCode ?? ''),
    guardFormula(r.episodeTitle),
    r.platformId,
    guardFormula(r.variantLabel ?? ''),
    r.publishedAt ?? '',
    guardFormula(r.postUrl ?? ''),
    r.metricKey ? (r.capturedAt ?? '') : '',
    r.metricKey ?? '',
    r.metricKey ? (r.state ?? '') : '',
    r.metricKey ? valueCell(r) : '',
    r.metricKey ? (r.unit ?? '') : '',
    guardFormula(r.metricKey ? (r.note ?? '') : ''),
  ]);
  return toCsv([[...CSV_COLUMNS], ...rows]);
}

export function templateCsv(): string {
  return toCsv([[...CSV_COLUMNS], ...TEMPLATE_ROWS]);
}

export function exportFileName(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${now.toISOString().slice(0, 10)}.csv`;
}
