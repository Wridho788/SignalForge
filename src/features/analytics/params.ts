import { PLATFORM_IDS, type PlatformId } from '@/lib/domain/types';
import { DEFAULT_QUERY, SORT_KEYS, type AnalyticsQuery, type SortKey } from '@/lib/services/analytics';

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : null;
};

const isRealDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Query string → validated AnalyticsQuery. URL values are untrusted: anything invalid is dropped
 * (and reported) rather than passed on. Lengths are capped.
 */
export function parseAnalyticsParams(raw: Raw): { query: AnalyticsQuery; ignored: string[] } {
  const ignored: string[] = [];
  const q: AnalyticsQuery = { ...DEFAULT_QUERY };

  const metric = first(raw.metric);
  if (metric) {
    if (metric.length <= 80 && /^[A-Za-z0-9_-]+$/.test(metric)) q.metricId = metric;
    else ignored.push('metrik');
  }

  const windowRaw = first(raw.window);
  if (windowRaw) {
    if (/^\d{1,4}$/.test(windowRaw)) q.windowHours = Number(windowRaw);
    else ignored.push('usia target');
  }

  const platform = first(raw.platform);
  if (platform) {
    if ((PLATFORM_IDS as readonly string[]).includes(platform)) q.platformId = platform as PlatformId;
    else ignored.push('platform');
  }

  const episode = first(raw.episode);
  if (episode) {
    if (episode.length <= 80 && /^[A-Za-z0-9-]+$/.test(episode)) q.episodeId = episode;
    else ignored.push('episode');
  }

  const tag = first(raw.tag);
  if (tag) {
    if (tag.length <= 40) q.tag = tag;
    else ignored.push('tag');
  }

  for (const key of ['from', 'to'] as const) {
    const v = first(raw[key]);
    if (!v) continue;
    if (isRealDate(v)) q[key] = v;
    else ignored.push(key === 'from' ? 'tanggal mulai' : 'tanggal akhir');
  }

  const sort = first(raw.sort);
  if (sort) {
    if ((SORT_KEYS as readonly string[]).includes(sort)) q.sort = sort as SortKey;
    else ignored.push('urutan');
  }
  const dir = first(raw.dir);
  if (dir) {
    if (dir === 'asc' || dir === 'desc') q.dir = dir;
    else ignored.push('arah urutan');
  }
  return { query: q, ignored };
}

/** Rebuilds a query string for links (omits defaults/blank values). */
export function queryToSearch(q: AnalyticsQuery, overrides: Partial<AnalyticsQuery> = {}): string {
  const m = { ...q, ...overrides };
  const p = new URLSearchParams();
  if (m.metricId) p.set('metric', m.metricId);
  if (m.windowHours !== null) p.set('window', String(m.windowHours));
  if (m.platformId) p.set('platform', m.platformId);
  if (m.episodeId) p.set('episode', m.episodeId);
  if (m.tag) p.set('tag', m.tag);
  if (m.from) p.set('from', m.from);
  if (m.to) p.set('to', m.to);
  if (m.sort !== DEFAULT_QUERY.sort) p.set('sort', m.sort);
  if (m.dir !== DEFAULT_QUERY.dir) p.set('dir', m.dir);
  const s = p.toString();
  return s ? `?${s}` : '';
}
