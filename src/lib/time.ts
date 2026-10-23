/**
 * Timestamp helpers. Storage is always UTC ISO-8601 (`...Z`); the UI renders and parses in the
 * user-selected IANA time zone. Pure and isomorphic (also used by a client-side preview).
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(ms: number, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `tz` from UTC at instant `ms`, in minutes (e.g. +420 for Asia/Jakarta). */
export function zoneOffsetMinutes(ms: number, tz: string): number {
  const p = partsInZone(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export function utcOffsetLabel(tz: string, atMs: number = Date.now()): string {
  const off = zoneOffsetMinutes(atMs, tz);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** `YYYY-MM-DDTHH:mm` in `tz` — the value format of `<input type="datetime-local">`. */
export function isoToLocalInput(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = partsInZone(ms, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Human-readable `YYYY-MM-DD HH:mm` in `tz` (unambiguous; the zone is shown once per page). */
export function formatDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const local = isoToLocalInput(iso, tz);
  return local ? local.replace('T', ' ') : '—';
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Interprets a `datetime-local` value as wall-clock time in `tz` and returns UTC ISO-8601.
 * Returns null when the text is malformed, out of range, or does not exist in `tz`
 * (e.g. skipped by a DST jump). For ambiguous times (DST overlap) the earlier instant is used.
 */
export function localInputToUtcIso(local: string, tz: string): string | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m || !isValidTimeZone(tz)) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== mi
  ) {
    return null;
  }
  const first = naive - zoneOffsetMinutes(naive, tz) * 60000;
  const second = naive - zoneOffsetMinutes(first, tz) * 60000;
  const candidates = first === second ? [first] : [first, second].sort((a, b) => a - b);
  for (const ms of candidates) {
    if (isoToLocalInput(new Date(ms).toISOString(), tz) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`) {
      return new Date(ms).toISOString();
    }
  }
  return null;
}

/** captured - published in whole seconds; null when either is unknown. May be negative. */
export function postAgeSeconds(
  publishedAt: string | null | undefined,
  capturedAt: string | null | undefined,
): number | null {
  if (!publishedAt || !capturedAt) return null;
  const a = Date.parse(publishedAt);
  const b = Date.parse(capturedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 1000);
}

/** Post age for display: `5,5 jam` under 48h, otherwise `3 hari 4 jam`. */
export function formatPostAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'Usia post tidak diketahui';
  const hours = seconds / 3600;
  if (Math.abs(hours) < 48) return `${(Math.round(hours * 10) / 10).toString().replace('.', ',')} jam`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest === 0 ? `${days} hari` : `${days} hari ${rest} jam`;
}

/** Gap between two instants, e.g. `2 hari 3 jam`, `45 menit`. */
export function formatGap(fromIso: string, toIso: string): string {
  const seconds = Math.abs(Date.parse(toIso) - Date.parse(fromIso)) / 1000;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} menit`;
  return formatPostAge(seconds);
}
