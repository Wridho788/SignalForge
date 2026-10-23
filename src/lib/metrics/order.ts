/** Display priority for the seeded metrics: reach/consumption first, then engagement, then derived. */
const PRIORITY = [
  'views',
  'reach',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'followers_gained',
  'watch_time_seconds',
  'average_view_duration_seconds',
  'click_through_rate',
];

export interface Orderable {
  key: string;
  label: string;
  platformId: string | null;
}

/** Shared definitions by priority, other shared by label, then platform-specific by label. */
export function compareMetricDefinitions(a: Orderable, b: Orderable): number {
  const scope = Number(a.platformId !== null) - Number(b.platformId !== null);
  if (scope !== 0) return scope;
  const rank = (m: Orderable) => {
    const i = PRIORITY.indexOf(m.key);
    return i === -1 ? PRIORITY.length : i;
  };
  return rank(a) - rank(b) || a.label.localeCompare(b.label);
}
