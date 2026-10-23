import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, NotFoundError } from '../domain/errors';
import { inTransaction } from '../db/tx';
import { getDistributionRow, type DistributionRow } from '../repositories/distributions';
import { touchEpisode } from '../repositories/episodes';
import {
  listMetricDefinitionRows,
  type MetricDefinitionRow,
} from '../repositories/metric-definitions';
import {
  getSnapshotRow,
  hasSnapshotAt,
  insertSnapshot,
  insertSnapshotValue,
  listSnapshotRows,
  listSupersededSnapshotIds,
  listValueRowsForDistribution,
  nextKnownValue,
  previousKnownValue,
  type SnapshotRow,
  type SnapshotValueRow,
} from '../repositories/snapshots';
import { formatMetricValue } from '../metrics/format';
import { parseMetricInput } from '../metrics/parse';
import { formatDateTime, formatGap, localInputToUtcIso, postAgeSeconds } from '../time';

const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Form field names are derived from the definition id so the action never trusts client-supplied keys. */
export const valueFieldName = (definitionId: string) => `value__${definitionId}`;
export const modeFieldName = (definitionId: string) => `mode__${definitionId}`;

export type EntryMode = 'value' | 'not_available' | 'not_applicable';

export interface SnapshotEntryInput {
  metricDefinitionId: string;
  mode: EntryMode;
  /** Raw text. Blank with mode 'value' means unknown: no row is stored (never 0). */
  raw: string;
}

export interface SnapshotInput {
  capturedAtLocal: string;
  note: string | null;
  supersedesSnapshotId: string | null;
  entries: SnapshotEntryInput[];
}

export interface RecordContext {
  timezone: string;
  confirmWarnings: boolean;
  now?: Date;
}

export type RecordResult =
  | { status: 'saved'; snapshotId: string }
  | { status: 'needs_confirmation'; warnings: string[] };

/** Applicable = shared definitions plus ones scoped to this distribution's platform. */
export function listApplicableMetrics(db: DatabaseSync, platformId: string): MetricDefinitionRow[] {
  return listMetricDefinitionRows(db, { applicableTo: platformId, activeOnly: true });
}

export function recordSnapshot(
  db: DatabaseSync,
  distributionId: string,
  input: SnapshotInput,
  ctx: RecordContext,
): RecordResult {
  const now = ctx.now ?? new Date();
  const distribution = getDistributionRow(db, distributionId);
  if (!distribution) throw new NotFoundError('Distribusi');

  const fieldErrors: Record<string, string> = {};
  const warnings: string[] = [];

  // --- captured_at ---
  let capturedAt: string | null = null;
  if (!input.capturedAtLocal.trim()) {
    fieldErrors.capturedAtLocal = 'Waktu pengambilan data wajib diisi.';
  } else {
    capturedAt = localInputToUtcIso(input.capturedAtLocal, ctx.timezone);
    if (!capturedAt) {
      fieldErrors.capturedAtLocal = `Waktu tidak valid di zona waktu ${ctx.timezone} (format salah atau waktu tidak ada).`;
    } else if (Date.parse(capturedAt) > now.getTime() + FUTURE_SKEW_MS) {
      fieldErrors.capturedAtLocal = 'Waktu pengambilan data tidak boleh di masa depan.';
      capturedAt = null;
    } else if (distribution.publishedAt && Date.parse(capturedAt) < Date.parse(distribution.publishedAt)) {
      fieldErrors.capturedAtLocal = `Waktu pengambilan data lebih awal dari waktu terbit (${formatDateTime(
        distribution.publishedAt,
        ctx.timezone,
      )}). Periksa zona waktu atau waktu terbit.`;
      capturedAt = null;
    }
  }

  // --- supersedes ---
  let supersedes: SnapshotRow | undefined;
  if (input.supersedesSnapshotId) {
    supersedes = getSnapshotRow(db, input.supersedesSnapshotId);
    if (!supersedes || supersedes.distributionId !== distributionId) {
      throw new DomainError('Snapshot yang dikoreksi tidak ditemukan pada distribusi ini.', {});
    }
    if (listSupersededSnapshotIds(db, distributionId).has(supersedes.id)) {
      throw new DomainError('Snapshot ini sudah pernah dikoreksi. Koreksi snapshot penggantinya.', {});
    }
  }

  // --- values ---
  const definitions = new Map(listApplicableMetrics(db, distribution.platformId).map((d) => [d.id, d]));
  const rows: SnapshotValueRow[] = [];
  const seen = new Set<string>();
  for (const entry of input.entries) {
    const def = definitions.get(entry.metricDefinitionId);
    if (!def) throw new DomainError('Metrik tidak berlaku untuk platform distribusi ini.', {});
    if (seen.has(def.id)) throw new DomainError('Metrik dikirim lebih dari sekali.', {});
    seen.add(def.id);
    const field = valueFieldName(def.id);

    if (entry.mode === 'not_available' || entry.mode === 'not_applicable') {
      if (entry.raw.trim() !== '') {
        fieldErrors[field] = 'Kosongkan nilai jika memilih Tidak tersedia / Tidak berlaku.';
        continue;
      }
      rows.push({
        snapshotId: '',
        metricDefinitionId: def.id,
        numericValue: null,
        textValue: null,
        valueState: entry.mode,
      });
      continue;
    }
    if (entry.raw.trim() === '') continue; // unknown: stays absent, never 0

    const parsed = parseMetricInput(entry.raw, def);
    if (!parsed.ok) {
      fieldErrors[field] = parsed.error;
      continue;
    }
    rows.push({
      snapshotId: '',
      metricDefinitionId: def.id,
      numericValue: parsed.numericValue,
      textValue: parsed.textValue,
      valueState: 'known',
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new DomainError('Periksa kembali isian yang ditandai.', fieldErrors);
  }
  if (rows.length === 0) {
    throw new DomainError(
      'Isi minimal satu metrik, atau tandai metrik sebagai Tidak tersedia / Tidak berlaku. Kolom kosong berarti tidak diketahui dan tidak disimpan.',
      {},
    );
  }
  if (!capturedAt) throw new DomainError('Periksa kembali isian yang ditandai.', fieldErrors);

  // --- warnings (non-blocking, need confirmation) ---
  if (distribution.publishedAt === null) {
    warnings.push(
      'Waktu terbit distribusi ini belum diketahui, jadi usia post snapshot ini tidak bisa dihitung dan tidak bisa dipakai untuk perbandingan usia setara.',
    );
  }
  const excludeId = supersedes?.id ?? null;
  if (hasSnapshotAt(db, distributionId, capturedAt, excludeId)) {
    warnings.push('Sudah ada snapshot dengan waktu pengambilan yang sama untuk distribusi ini.');
  }
  for (const row of rows) {
    if (row.valueState !== 'known' || row.numericValue === null) continue;
    const def = definitions.get(row.metricDefinitionId)!;
    if (def.aggregationKind !== 'counter' && def.aggregationKind !== 'duration') continue;
    const fmt = (n: number) => formatMetricValue(def, { valueState: 'known', numericValue: n, textValue: null }).text;
    const prev = previousKnownValue(db, distributionId, def.id, capturedAt, excludeId);
    if (prev && row.numericValue < prev.value) {
      warnings.push(
        `${def.label}: ${fmt(row.numericValue)} lebih rendah dari ${fmt(prev.value)} pada snapshot sebelumnya (${formatDateTime(
          prev.capturedAt,
          ctx.timezone,
        )}). Jika metrik ini kumulatif, periksa kemungkinan salah ketik.`,
      );
    }
    const next = nextKnownValue(db, distributionId, def.id, capturedAt, excludeId);
    if (next && row.numericValue > next.value) {
      warnings.push(
        `${def.label}: ${fmt(row.numericValue)} lebih tinggi dari ${fmt(next.value)} pada snapshot yang lebih baru (${formatDateTime(
          next.capturedAt,
          ctx.timezone,
        )}). Jika metrik ini kumulatif, periksa kemungkinan salah ketik.`,
      );
    }
  }

  if (warnings.length > 0 && !ctx.confirmWarnings) {
    return { status: 'needs_confirmation', warnings };
  }

  const snapshotId = inTransaction(db, () => {
    const id = insertSnapshot(db, {
      distributionId,
      capturedAt,
      postAgeSeconds: postAgeSeconds(distribution.publishedAt, capturedAt),
      source: 'manual',
      note: input.note,
      supersedesSnapshotId: supersedes?.id ?? null,
    });
    for (const row of rows) insertSnapshotValue(db, { ...row, snapshotId: id });
    touchEpisode(db, distribution.episodeId);
    return id;
  });
  return { status: 'saved', snapshotId };
}

// --- timeline read model ---

export interface TimelineSnapshot {
  snapshot: SnapshotRow;
  values: Map<string, SnapshotValueRow>;
  /** Id of the snapshot that replaced this one, if any. */
  supersededBy: string | null;
  /** Human-readable gap since the previous snapshot, or null for the first. */
  gapFromPrevious: string | null;
}

export interface DistributionTimeline {
  distribution: DistributionRow;
  /** Columns: metrics (active or not) that have at least one recorded row in these snapshots. */
  metrics: MetricDefinitionRow[];
  /** Applicable active metrics with nothing recorded yet (named in the UI so gaps are explicit). */
  metricsWithoutValues: MetricDefinitionRow[];
  snapshots: TimelineSnapshot[];
  /** Applicable active metrics lacking a source definition (provenance warning). */
  metricsMissingSource: MetricDefinitionRow[];
}

export function getDistributionTimeline(db: DatabaseSync, distributionId: string): DistributionTimeline {
  const distribution = getDistributionRow(db, distributionId);
  if (!distribution) throw new NotFoundError('Distribusi');

  const snapshots = listSnapshotRows(db, distributionId);
  const valueRows = listValueRowsForDistribution(db, distributionId);
  const superseded = listSupersededSnapshotIds(db, distributionId);

  const valuesBySnapshot = new Map<string, Map<string, SnapshotValueRow>>();
  const usedMetricIds = new Set<string>();
  for (const v of valueRows) {
    usedMetricIds.add(v.metricDefinitionId);
    if (!valuesBySnapshot.has(v.snapshotId)) valuesBySnapshot.set(v.snapshotId, new Map());
    valuesBySnapshot.get(v.snapshotId)!.set(v.metricDefinitionId, v);
  }

  const applicable = listApplicableMetrics(db, distribution.platformId);
  // Already in display order (see metrics/order.ts); includes inactive metrics that hold values.
  const withData = listMetricDefinitionRows(db, { applicableTo: distribution.platformId }).filter((d) =>
    usedMetricIds.has(d.id),
  );

  return {
    distribution,
    metrics: withData,
    metricsWithoutValues: applicable.filter((d) => !usedMetricIds.has(d.id)),
    snapshots: snapshots.map((snapshot, i) => ({
      snapshot,
      values: valuesBySnapshot.get(snapshot.id) ?? new Map(),
      supersededBy: superseded.get(snapshot.id) ?? null,
      gapFromPrevious: i === 0 ? null : formatGap(snapshots[i - 1]!.capturedAt, snapshot.capturedAt),
    })),
    metricsMissingSource: applicable.filter((d) => !d.sourceDefinition),
  };
}
