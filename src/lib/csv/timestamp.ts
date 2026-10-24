import { localInputToUtcIso } from '../time';

export type TimestampResult =
  | { ok: true; iso: string; assumedLocal: boolean }
  | { ok: false };

const WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;

/**
 * CSV timestamps are unambiguous when they carry `Z` or an offset. A bare `YYYY-MM-DD HH:mm` is read as
 * wall-clock time in `timezone` (the importer reports how many rows relied on that assumption).
 * Impossible dates (Feb 30), out-of-range offsets and non-existent local times are rejected.
 */
export function parseCsvTimestamp(raw: string, timezone: string): TimestampResult {
  const text = raw.trim();
  const m = WITH_OFFSET.exec(text);
  if (m) {
    const [, y, mo, d, h, mi, s = '0', , zone] = m;
    const offset = zone === 'Z' ? '+00:00' : zone!;
    const offH = Number(offset.slice(1, 3));
    const offM = Number(offset.slice(4, 6));
    if (offH > 14 || offM > 59) return { ok: false };
    // Validate the calendar fields independently of Date's lenient rollover.
    const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    if (
      check.getUTCFullYear() !== Number(y) ||
      check.getUTCMonth() !== Number(mo) - 1 ||
      check.getUTCDate() !== Number(d) ||
      check.getUTCHours() !== Number(h) ||
      check.getUTCMinutes() !== Number(mi)
    ) {
      return { ok: false };
    }
    const ms = Date.parse(text.replace(' ', 'T'));
    return Number.isNaN(ms) ? { ok: false } : { ok: true, iso: new Date(ms).toISOString(), assumedLocal: false };
  }
  if (LOCAL.test(text)) {
    const iso = localInputToUtcIso(text.replace(' ', 'T'), timezone);
    return iso ? { ok: true, iso, assumedLocal: true } : { ok: false };
  }
  return { ok: false };
}
