/**
 * Mock data for E2E, built from the documented CSV format v1 (docs: README, DATA_MODEL §5, ADR 0006):
 * columns, seeded metric keys (views, likes, click_through_rate, saves, followers_gained), value states
 * (known / not_available), ratio as percent, ISO-8601 with offset or local "YYYY-MM-DD HH:mm".
 */
export const CSV_HEADER = [
  'schema_version', 'episode_code', 'episode_title', 'platform', 'variant_label', 'published_at', 'post_url',
  'captured_at', 'metric_key', 'value_state', 'value', 'unit', 'note',
] as const;

export type CsvRow = Partial<Record<(typeof CSV_HEADER)[number], string>>;

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildCsv(rows: CsvRow[]): Buffer {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) lines.push(CSV_HEADER.map((c) => cell(r[c] ?? (c === 'schema_version' ? '1' : ''))).join(','));
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

const yt = (o: CsvRow): CsvRow => ({ platform: 'youtube', published_at: '2026-10-01T10:00:00+07:00', ...o });

/** Valid mock data: zero, N/A, ratio %, negative follower change, local timestamp, structure-only row, formula-looking title. */
export const VALID_ROWS: CsvRow[] = [
  yt({ episode_code: 'EP-IMP-1', episode_title: 'Impor Satu', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '0', unit: 'views', note: 'Dari dasbor' }),
  yt({ episode_code: 'EP-IMP-1', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'likes', value_state: 'known', value: '25', unit: 'likes', note: 'Dari dasbor' }),
  yt({ episode_code: 'EP-IMP-1', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'click_through_rate', value_state: 'known', value: '4.5', unit: 'ratio', note: 'Dari dasbor' }),
  yt({ episode_code: 'EP-IMP-1', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'saves', value_state: 'not_available', unit: 'saves', note: 'Dari dasbor' }),
  yt({ episode_code: 'EP-IMP-1', captured_at: '2026-10-03T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '300' }),
  yt({ episode_code: 'EP-IMP-1', captured_at: '2026-10-03T10:00:00+07:00', metric_key: 'followers_gained', value_state: 'known', value: '-2' }),
  { episode_code: 'EP-IMP-1', platform: 'tiktok', published_at: '2026-10-01 12:00', captured_at: '2026-10-02 12:00', metric_key: 'views', value_state: 'known', value: '1200' },
  yt({ episode_code: 'EP-IMP-2', episode_title: 'Impor Dua (hanya struktur)', post_url: 'https://example.com/post/2' }),
  yt({ episode_code: 'EP-IMP-3', episode_title: `'=HYPERLINK("http://example.invalid","klik")`, captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '5' }),
];

/** One good snapshot plus rows that must be rejected, to exercise per-row errors. */
export const MIXED_ROWS: CsvRow[] = [
  yt({ episode_code: 'EP-MIX-1', episode_title: 'Campuran Baik', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '10' }),
  yt({ episode_code: 'EP-MIX-2', episode_title: 'Campuran Buruk', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '1.5' }),
  yt({ episode_code: 'EP-MIX-2', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'likes', value_state: 'known', value: '7' }),
  { episode_code: 'EP-MIX-3', episode_title: 'Platform Salah', platform: 'instagram', captured_at: '2026-10-02T10:00:00+07:00', metric_key: 'views', value_state: 'known', value: '1' },
];
