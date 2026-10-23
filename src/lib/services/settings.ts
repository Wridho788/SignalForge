import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError } from '../domain/errors';
import { getSetting, setSetting } from '../repositories/settings';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../time';
import {
  comparisonWindowsSchema,
  DEFAULT_COMPARISON_WINDOWS,
  type AppSettings,
  type ComparisonWindow,
} from '../validation/settings';

const TIMEZONE_KEY = 'timezone';
const WINDOWS_KEY = 'comparison_windows';

/** Settings with safe fallbacks: a corrupt stored value never breaks the app. */
export function getAppSettings(db: DatabaseSync): AppSettings {
  const tz = getSetting(db, TIMEZONE_KEY);
  let windows: ComparisonWindow[] = DEFAULT_COMPARISON_WINDOWS;
  const rawWindows = getSetting(db, WINDOWS_KEY);
  if (rawWindows) {
    try {
      const parsed = comparisonWindowsSchema.safeParse(JSON.parse(rawWindows));
      if (parsed.success) windows = parsed.data;
    } catch {
      // keep defaults
    }
  }
  return {
    timezone: tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE,
    comparisonWindows: windows,
  };
}

export function updateAppSettings(db: DatabaseSync, next: AppSettings): void {
  if (!isValidTimeZone(next.timezone)) {
    throw new DomainError('Zona waktu tidak dikenal.', { timezone: 'Zona waktu tidak dikenal.' });
  }
  const parsed = comparisonWindowsSchema.safeParse(next.comparisonWindows);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Jendela perbandingan tidak valid.';
    throw new DomainError(message, { comparisonWindows: message });
  }
  setSetting(db, TIMEZONE_KEY, next.timezone);
  setSetting(db, WINDOWS_KEY, JSON.stringify(parsed.data));
}
