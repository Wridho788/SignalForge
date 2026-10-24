import { describe, expect, it } from 'vitest';
import { parseCsvTimestamp } from './timestamp';

const TZ = 'Asia/Jakarta';

describe('parseCsvTimestamp', () => {
  it('reads UTC and offset timestamps as absolute instants', () => {
    expect(parseCsvTimestamp('2026-10-02T10:00:00Z', TZ)).toEqual({ ok: true, iso: '2026-10-02T10:00:00.000Z', assumedLocal: false });
    expect(parseCsvTimestamp('2026-10-02T10:00:00+07:00', TZ)).toEqual({ ok: true, iso: '2026-10-02T03:00:00.000Z', assumedLocal: false });
    expect(parseCsvTimestamp('2026-10-02 10:00:00-05:30', TZ)).toMatchObject({ ok: true, iso: '2026-10-02T15:30:00.000Z' });
    expect(parseCsvTimestamp('2026-10-02T10:00+07:00', TZ)).toMatchObject({ ok: true, iso: '2026-10-02T03:00:00.000Z' });
    expect(parseCsvTimestamp('2026-10-02T10:00:00.250Z', TZ)).toMatchObject({ ok: true, iso: '2026-10-02T10:00:00.250Z' });
  });

  it('reads a bare local time in the selected time zone and says it was assumed', () => {
    expect(parseCsvTimestamp('2026-10-02 10:00', TZ)).toEqual({ ok: true, iso: '2026-10-02T03:00:00.000Z', assumedLocal: true });
    expect(parseCsvTimestamp('2026-10-02T10:00', 'Asia/Taipei')).toMatchObject({ iso: '2026-10-02T02:00:00.000Z', assumedLocal: true });
  });

  it('rejects impossible dates, bad offsets, non-existent local times and other formats', () => {
    for (const bad of ['2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-10-02T25:00:00Z', '2026-10-02T10:00:00+25:00', '2026-10-02', '02/10/2026 10:00', '', 'garbage', '2026-10-02T10:00:00']) {
      expect(parseCsvTimestamp(bad, TZ), bad).toEqual({ ok: false });
    }
    // 02:30 does not exist in New York on the spring-forward date.
    expect(parseCsvTimestamp('2026-03-08 02:30', 'America/New_York')).toEqual({ ok: false });
  });
});
