import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { setSetting } from '../repositories/settings';
import { testDb } from '@/test/helpers';
import { getAppSettings, updateAppSettings } from './settings';

describe('app settings', () => {
  it('returns defaults on an empty database', () => {
    const s = getAppSettings(testDb());
    expect(s.timezone).toBe('Asia/Jakarta');
    expect(s.comparisonWindows).toEqual([
      { hours: 24, toleranceHours: 6 },
      { hours: 168, toleranceHours: 24 },
    ]);
  });

  it('persists valid updates', () => {
    const db = testDb();
    updateAppSettings(db, { timezone: 'Asia/Taipei', comparisonWindows: [{ hours: 48, toleranceHours: 12 }] });
    expect(getAppSettings(db)).toEqual({ timezone: 'Asia/Taipei', comparisonWindows: [{ hours: 48, toleranceHours: 12 }] });
  });

  it('rejects invalid time zones and windows', () => {
    const db = testDb();
    expect(() => updateAppSettings(db, { timezone: 'Mars/Base', comparisonWindows: [{ hours: 24, toleranceHours: 6 }] })).toThrow(DomainError);
    expect(() => updateAppSettings(db, { timezone: 'Asia/Jakarta', comparisonWindows: [{ hours: 24, toleranceHours: 30 }] })).toThrow(DomainError);
    expect(() =>
      updateAppSettings(db, {
        timezone: 'Asia/Jakarta',
        comparisonWindows: [
          { hours: 24, toleranceHours: 6 },
          { hours: 24, toleranceHours: 3 },
        ],
      }),
    ).toThrow(/duplikat/);
    expect(() => updateAppSettings(db, { timezone: 'Asia/Jakarta', comparisonWindows: [] })).toThrow(DomainError);
  });

  it('falls back to defaults when stored values are corrupt', () => {
    const db = testDb();
    setSetting(db, 'timezone', 'Not/AZone');
    setSetting(db, 'comparison_windows', '{not json');
    expect(getAppSettings(db)).toMatchObject({ timezone: 'Asia/Jakarta' });
    setSetting(db, 'comparison_windows', JSON.stringify([{ hours: -1, toleranceHours: 0 }]));
    expect(getAppSettings(db).comparisonWindows).toHaveLength(2);
  });
});
