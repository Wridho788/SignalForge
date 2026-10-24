/**
 * SignalForge CSV format v1 — one row per metric value ("long" format), so configurable metrics
 * need no schema change. Rows are grouped into snapshots by (episode, platform, variant, captured_at).
 *
 *  - A row with blank `captured_at` AND blank `metric_key` is a structure-only row: it ensures the
 *    episode/distribution exists and carries no measurements.
 *  - `value` is blank unless `value_state` is `known`. Blank/absent never means 0: to record
 *    "unknown", simply leave the metric out.
 *  - Ratios are percentages (0–100), exactly as in the entry form.
 *  - Timestamps: ISO-8601 with `Z` or an offset (`2026-10-02T10:00:00+07:00`), or local
 *    `YYYY-MM-DD HH:mm` which is read in the time zone chosen in Settings (the preview says so).
 */
export const CSV_SCHEMA_VERSION = '1';

export const CSV_COLUMNS = [
  'schema_version',
  'episode_code',
  'episode_title',
  'platform',
  'variant_label',
  'published_at',
  'post_url',
  'captured_at',
  'metric_key',
  'value_state',
  'value',
  'unit',
  'note',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Columns whose text is protected against spreadsheet formulas on export and unprotected on import. */
export const TEXT_COLUMNS: readonly CsvColumn[] = ['episode_code', 'episode_title', 'variant_label', 'post_url', 'note'];

/** Marker so an untouched template can never be mistaken for real data. */
export const TEMPLATE_MARKER = '[CONTOH]';

export const TEMPLATE_ROWS: string[][] = [
  [
    CSV_SCHEMA_VERSION, 'EP-001', `${TEMPLATE_MARKER} Judul episode`, 'youtube', '', '2026-10-01T10:00:00+07:00', 'https://example.com/post',
    '', '', '', '', '', 'Hanya struktur: membuat episode dan distribusi tanpa snapshot. Hapus baris contoh sebelum impor.',
  ],
  [CSV_SCHEMA_VERSION, 'EP-001', '', 'youtube', '', '', '', '2026-10-02T10:00:00+07:00', 'views', 'known', '1200', 'views', 'Dibaca dari dasbor platform'],
  [CSV_SCHEMA_VERSION, 'EP-001', '', 'youtube', '', '', '', '2026-10-02T10:00:00+07:00', 'likes', 'known', '0', 'likes', ''],
  [CSV_SCHEMA_VERSION, 'EP-001', '', 'youtube', '', '', '', '2026-10-02T10:00:00+07:00', 'click_through_rate', 'known', '4.5', 'ratio', ''],
  [CSV_SCHEMA_VERSION, 'EP-001', '', 'youtube', '', '', '', '2026-10-02T10:00:00+07:00', 'saves', 'not_available', '', 'saves', ''],
];
