import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { selectEquivalent, type EquivalentResult, type SnapshotPoint, type UnavailableReason } from '../analytics/equivalent-age';
import {
  MIN_RANK_SAMPLE,
  SMALL_SAMPLE,
  compareNullable,
  computeChange,
  summarize,
  type Change,
  type Summary,
} from '../analytics/stats';
import { PLATFORM_IDS, type PlatformId } from '../domain/types';
import {
  countUndatedDistributions,
  listAnalyticsDistributions,
  listMetricPoints,
  type AnalyticsDistributionRow,
  type DistributionFilter,
  type MetricPointRow,
} from '../repositories/analytics';
import type { MetricDefinitionRow } from '../repositories/metric-definitions';
import { localInputToUtcIso } from '../time';
import type { ComparisonWindow } from '../validation/settings';
import { listMetricDefinitions } from './metric-definitions';
import { getAppSettings } from './settings';

export const SORT_KEYS = ['episode', 'platform', 'published', 'value', 'age'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface AnalyticsQuery {
  metricId: string | null;
  windowHours: number | null;
  platformId: PlatformId | null;
  episodeId: string | null;
  tag: string | null;
  /** Local calendar dates (YYYY-MM-DD) in the user's time zone. */
  from: string | null;
  to: string | null;
  sort: SortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_QUERY: AnalyticsQuery = {
  metricId: null,
  windowHours: null,
  platformId: null,
  episodeId: null,
  tag: null,
  from: null,
  to: null,
  sort: 'published',
  dir: 'desc',
};

const NUMERIC_KINDS = new Set(['counter', 'ratio', 'duration', 'currency']);

export interface AnalyticsRow extends AnalyticsDistributionRow {
  result: EquivalentResult;
  /** Provenance of the chosen reading (e.g. 'manual'); null when no reading was used. */
  snapshotSource: string | null;
}

export type Completeness = 'comparable' | UnavailableReason;

export interface TrendPoint {
  distributionId: string;
  label: string;
  publishedAt: string;
  value: number | null;
  reason: UnavailableReason | null;
  actualAgeHours: number | null;
}

export interface PlatformGroup {
  platformId: PlatformId;
  platformName: string;
  total: number;
  comparable: number;
  summary: Summary;
  /** Present only with enough comparable posts; otherwise null and `rankingNote` explains. */
  top: AnalyticsRow[];
  bottom: AnalyticsRow[];
  rankingNote: string | null;
  /** Series for the trend chart: dated distributions in publish order (undated ones are counted, not plotted). */
  trend: TrendPoint[];
  undated: number;
}

export interface AnalyticsReport {
  query: AnalyticsQuery;
  timezone: string;
  metric: MetricDefinitionRow | null;
  metricChoices: MetricDefinitionRow[];
  window: ComparisonWindow;
  windows: ComparisonWindow[];
  rows: AnalyticsRow[];
  groups: PlatformGroup[];
  quality: {
    total: number;
    comparable: number;
    byReason: Partial<Record<UnavailableReason, number>>;
    undatedExcludedByDateFilter: number;
  };
  notes: string[];
}

/** [from, before) UTC bounds for local calendar dates; invalid input yields a note, not an exception. */
export function dateRangeToUtc(
  from: string | null,
  to: string | null,
  timezone: string,
): { publishedFrom: string | null; publishedBefore: string | null; notes: string[] } {
  const notes: string[] = [];
  let publishedFrom: string | null = null;
  let publishedBefore: string | null = null;
  if (from) {
    publishedFrom = localInputToUtcIso(`${from}T00:00`, timezone);
    if (!publishedFrom) notes.push(`Tanggal mulai "${from}" tidak valid di zona ${timezone}; filter tanggal mulai diabaikan.`);
  }
  if (to) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    publishedBefore = Number.isNaN(next.getTime()) ? null : localInputToUtcIso(`${next.toISOString().slice(0, 10)}T00:00`, timezone);
    if (!publishedBefore) notes.push(`Tanggal akhir "${to}" tidak valid di zona ${timezone}; filter tanggal akhir diabaikan.`);
  }
  if (publishedFrom && publishedBefore && publishedFrom >= publishedBefore) {
    notes.push('Rentang tanggal terbalik (mulai setelah akhir); tidak ada data yang cocok.');
  }
  return { publishedFrom, publishedBefore, notes };
}

export function listAnalyticsMetrics(db: DatabaseSync): MetricDefinitionRow[] {
  return listMetricDefinitions(db, { activeOnly: true }).filter((m) => NUMERIC_KINDS.has(m.aggregationKind));
}

function toPoint(r: MetricPointRow): SnapshotPoint {
  return {
    snapshotId: r.snapshotId,
    capturedAt: r.capturedAt,
    postAgeSeconds: r.postAgeSeconds === null ? null : Number(r.postAgeSeconds),
    state: r.state,
    numericValue: r.numericValue === null ? null : Number(r.numericValue),
  };
}

function groupPoints(points: MetricPointRow[]): Map<string, MetricPointRow[]> {
  const m = new Map<string, MetricPointRow[]>();
  for (const p of points) {
    if (!m.has(p.distributionId)) m.set(p.distributionId, []);
    m.get(p.distributionId)!.push(p);
  }
  return m;
}

export function completenessOf(row: Pick<AnalyticsRow, 'result'>): Completeness {
  return row.result.ok ? 'comparable' : row.result.reason;
}

export function rowValue(row: Pick<AnalyticsRow, 'result'>): number | null {
  return row.result.ok ? row.result.value : null;
}

function sortRows(rows: AnalyticsRow[], key: SortKey, dir: 'asc' | 'desc'): AnalyticsRow[] {
  const pick: Record<SortKey, (r: AnalyticsRow) => string | number | null> = {
    episode: (r) => r.episodeTitle.toLowerCase(),
    platform: (r) => `${r.platformName}${r.variantLabel ?? ''}`.toLowerCase(),
    published: (r) => r.publishedAt,
    value: (r) => rowValue(r),
    age: (r) => (r.result.ok ? r.result.actualAgeHours : null),
  };
  const get = pick[key];
  // Stable tie-break on episode title so the order is deterministic.
  return [...rows].sort(
    (a, b) => compareNullable(get(a), get(b), dir) || a.episodeTitle.localeCompare(b.episodeTitle) || a.distributionId.localeCompare(b.distributionId),
  );
}

function buildRows(
  distributions: AnalyticsDistributionRow[],
  points: MetricPointRow[],
  window: ComparisonWindow,
): AnalyticsRow[] {
  const byDist = groupPoints(points);
  return distributions.map((d) => {
    const raw = byDist.get(d.distributionId) ?? [];
    const result = selectEquivalent(raw.map(toPoint), window.hours, window.toleranceHours);
    const used = result.ok ? raw.find((p) => p.snapshotId === result.snapshotId) : undefined;
    return { ...d, result, snapshotSource: used?.source ?? null };
  });
}

function buildGroup(platformId: PlatformId, platformName: string, rows: AnalyticsRow[]): PlatformGroup {
  const comparableRows = rows.filter((r) => r.result.ok);
  const ranked = [...comparableRows].sort(
    (a, b) => rowValue(b)! - rowValue(a)! || a.episodeTitle.localeCompare(b.episodeTitle),
  );
  let top: AnalyticsRow[] = [];
  let bottom: AnalyticsRow[] = [];
  let rankingNote: string | null = null;
  if (ranked.length < MIN_RANK_SAMPLE) {
    rankingNote = `Sampel terlalu kecil untuk peringkat (n=${ranked.length} < ${MIN_RANK_SAMPLE}).`;
  } else {
    top = ranked.slice(0, 3);
    bottom = ranked.length >= 6 ? ranked.slice(-3).reverse() : [];
    if (ranked.length < SMALL_SAMPLE) rankingNote = `Sampel kecil (n=${ranked.length}): peringkat tidak stabil, jangan disimpulkan.`;
    else if (ranked.length < 6) rankingNote = 'Daftar terbawah baru ditampilkan bila n ≥ 6 agar tidak tumpang-tindih dengan teratas.';
  }

  const dated = rows.filter((r) => r.publishedAt !== null).sort((a, b) => a.publishedAt!.localeCompare(b.publishedAt!));
  return {
    platformId,
    platformName,
    total: rows.length,
    comparable: comparableRows.length,
    summary: summarize(comparableRows.map((r) => rowValue(r)!)),
    top,
    bottom,
    rankingNote,
    trend: dated.map((r) => ({
      distributionId: r.distributionId,
      label: `${r.episodeTitle}${r.variantLabel ? ` — ${r.variantLabel}` : ''}`,
      publishedAt: r.publishedAt!,
      value: rowValue(r),
      reason: r.result.ok ? null : r.result.reason,
      actualAgeHours: r.result.ok ? r.result.actualAgeHours : null,
    })),
    undated: rows.length - dated.length,
  };
}

/** Resolves the metric/window the page should use: requested if valid, else sensible defaults. */
export function resolveSelection(
  db: DatabaseSync,
  query: AnalyticsQuery,
  windows: ComparisonWindow[],
): { metric: MetricDefinitionRow | null; metricChoices: MetricDefinitionRow[]; window: ComparisonWindow } {
  const metricChoices = listAnalyticsMetrics(db);
  const metric =
    metricChoices.find((m) => m.id === query.metricId) ?? metricChoices.find((m) => m.key === 'views') ?? metricChoices[0] ?? null;
  const window = windows.find((w) => w.hours === query.windowHours) ?? windows[0]!;
  return { metric, metricChoices, window };
}

export function getAnalytics(db: DatabaseSync, query: AnalyticsQuery): AnalyticsReport {
  const settings = getAppSettings(db);
  const { metric, metricChoices, window } = resolveSelection(db, query, settings.comparisonWindows);
  const notes: string[] = [];
  const range = dateRangeToUtc(query.from, query.to, settings.timezone);
  notes.push(...range.notes);

  const empty: AnalyticsReport = {
    query,
    timezone: settings.timezone,
    metric,
    metricChoices,
    window,
    windows: settings.comparisonWindows,
    rows: [],
    groups: [],
    quality: { total: 0, comparable: 0, byReason: {}, undatedExcludedByDateFilter: 0 },
    notes,
  };
  if (!metric) {
    notes.push('Belum ada metrik numerik aktif. Aktifkan atau buat metrik di Pengaturan → Metrik.');
    return empty;
  }

  // A platform-specific metric can only describe its own platform; never mix it into others.
  let platformId = query.platformId;
  if (metric.platformId) {
    if (platformId && platformId !== metric.platformId) {
      notes.push(`Metrik "${metric.label}" khusus ${metric.platformName}; tidak ada data untuk platform yang dipilih.`);
      return empty;
    }
    platformId = metric.platformId as PlatformId;
  }

  const filter: DistributionFilter = {
    platformId,
    episodeId: query.episodeId,
    tag: query.tag,
    publishedFrom: range.publishedFrom,
    publishedBefore: range.publishedBefore,
  };
  const distributions = listAnalyticsDistributions(db, filter);
  const rows = sortRows(buildRows(distributions, listMetricPoints(db, filter, metric.id), window), query.sort, query.dir);

  const byReason: Partial<Record<UnavailableReason, number>> = {};
  for (const r of rows) if (!r.result.ok) byReason[r.result.reason] = (byReason[r.result.reason] ?? 0) + 1;

  const groups: PlatformGroup[] = PLATFORM_IDS.flatMap((pid) => {
    const inPlatform = rows.filter((r) => r.platformId === pid);
    return inPlatform.length > 0 ? [buildGroup(pid, inPlatform[0]!.platformName, inPlatform)] : [];
  });

  const undatedExcluded = range.publishedFrom || range.publishedBefore ? countUndatedDistributions(db, filter) : 0;
  if (undatedExcluded > 0) {
    notes.push(`${undatedExcluded} distribusi tanpa waktu terbit tidak ikut karena filter tanggal.`);
  }
  if (!metric.sourceDefinition) {
    notes.push(`Definisi sumber metrik "${metric.label}" belum dicatat; arti angkanya di tiap platform belum terdokumentasi.`);
  }

  return {
    query,
    timezone: settings.timezone,
    metric,
    metricChoices,
    window,
    windows: settings.comparisonWindows,
    rows,
    groups,
    quality: {
      total: rows.length,
      comparable: rows.filter((r) => r.result.ok).length,
      byReason,
      undatedExcludedByDateFilter: undatedExcluded,
    },
    notes,
  };
}

// --- Overview KPIs ---

export interface PlatformKpi {
  platformId: PlatformId;
  platformName: string;
  latestLabel: string;
  latestPublishedAt: string | null;
  latest: EquivalentResult;
  /** Previous comparable post on the same platform (baseline for the delta), if any. */
  previousLabel: string | null;
  previous: EquivalentResult | null;
  change: Change | null;
  comparable: number;
  total: number;
}

/** "Most recent post per platform at the target age" with a delta vs the previous comparable post — never across platforms. */
export function getPlatformKpis(db: DatabaseSync): { metric: MetricDefinitionRow | null; window: ComparisonWindow; kpis: PlatformKpi[] } {
  const report = getAnalytics(db, { ...DEFAULT_QUERY, sort: 'published', dir: 'desc' });
  const kpis: PlatformKpi[] = report.groups.flatMap((g) => {
    const rows = report.rows.filter((r) => r.platformId === g.platformId && r.publishedAt !== null);
    const latest = rows[0];
    if (!latest) return [];
    const previous = rows.slice(1).find((r) => r.result.ok);
    const label = (r: AnalyticsRow) => `${r.episodeTitle}${r.variantLabel ? ` — ${r.variantLabel}` : ''}`;
    return [
      {
        platformId: g.platformId,
        platformName: g.platformName,
        latestLabel: label(latest),
        latestPublishedAt: latest.publishedAt,
        latest: latest.result,
        previousLabel: previous ? label(previous) : null,
        previous: previous?.result ?? null,
        change: previous ? computeChange(rowValue(previous), rowValue(latest)) : null,
        comparable: g.comparable,
        total: g.total,
      },
    ];
  });
  return { metric: report.metric, window: report.window, kpis };
}

// --- Per-episode performance ---

export interface SeriesPoint {
  snapshotId: string;
  capturedAt: string;
  postAgeHours: number | null;
  value: number | null;
  state: MetricPointRow['state'];
}

export interface SnapshotChange {
  fromCapturedAt: string;
  toCapturedAt: string;
  fromAgeHours: number | null;
  toAgeHours: number | null;
  change: Change;
}

export interface DistributionPerformance {
  distribution: AnalyticsDistributionRow;
  /** Value at each configured window. */
  windows: { window: ComparisonWindow; result: EquivalentResult }[];
  series: SeriesPoint[];
  changes: SnapshotChange[];
}

export function getEpisodePerformance(
  db: DatabaseSync,
  episodeId: string,
  metricId: string | null,
): { metric: MetricDefinitionRow | null; metricChoices: MetricDefinitionRow[]; timezone: string; distributions: DistributionPerformance[] } {
  const settings = getAppSettings(db);
  const { metric, metricChoices } = resolveSelection(db, { ...DEFAULT_QUERY, metricId }, settings.comparisonWindows);
  if (!metric) return { metric, metricChoices, timezone: settings.timezone, distributions: [] };

  const filter: DistributionFilter = { episodeId };
  const dists = listAnalyticsDistributions(db, filter).filter((d) => !metric.platformId || d.platformId === metric.platformId);
  const byDist = groupPoints(listMetricPoints(db, filter, metric.id));

  const distributions = dists.map((d): DistributionPerformance => {
    const raw = byDist.get(d.distributionId) ?? [];
    const points = raw.map(toPoint);
    const series: SeriesPoint[] = raw.map((r) => ({
      snapshotId: r.snapshotId,
      capturedAt: r.capturedAt,
      postAgeHours: r.postAgeSeconds === null ? null : Number(r.postAgeSeconds) / 3600,
      value: r.state === 'known' && r.numericValue !== null ? Number(r.numericValue) : null,
      state: r.state,
    }));
    const changes: SnapshotChange[] = series.slice(1).map((cur, i) => {
      const prev = series[i]!;
      return {
        fromCapturedAt: prev.capturedAt,
        toCapturedAt: cur.capturedAt,
        fromAgeHours: prev.postAgeHours,
        toAgeHours: cur.postAgeHours,
        change: computeChange(prev.value, cur.value),
      };
    });
    return {
      distribution: d,
      windows: settings.comparisonWindows.map((w) => ({ window: w, result: selectEquivalent(points, w.hours, w.toleranceHours) })),
      series,
      changes,
    };
  });
  return { metric, metricChoices, timezone: settings.timezone, distributions };
}
