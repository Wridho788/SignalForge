import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatGap,
  formatPostAge,
  isoToLocalInput,
  isValidTimeZone,
  localInputToUtcIso,
  postAgeSeconds,
  utcOffsetLabel,
} from './time';

describe('time zones', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Asia/Jakarta')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('converts wall-clock time in Asia/Jakarta (UTC+7) to UTC and back', () => {
    const iso = localInputToUtcIso('2026-10-23T22:15', 'Asia/Jakarta');
    expect(iso).toBe('2026-10-23T15:15:00.000Z');
    expect(isoToLocalInput(iso!, 'Asia/Jakarta')).toBe('2026-10-23T22:15');
    expect(formatDateTime(iso, 'Asia/Jakarta')).toBe('2026-10-23 22:15');
  });

  it('renders the same instant differently per zone', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    expect(formatDateTime(iso, 'Asia/Jakarta')).toBe('2026-01-01 07:00');
    expect(formatDateTime(iso, 'America/New_York')).toBe('2025-12-31 19:00');
  });

  it('handles DST: EDT vs EST offsets', () => {
    expect(utcOffsetLabel('America/New_York', Date.parse('2026-07-01T12:00:00Z'))).toBe('UTC-04:00');
    expect(utcOffsetLabel('America/New_York', Date.parse('2026-01-01T12:00:00Z'))).toBe('UTC-05:00');
    expect(localInputToUtcIso('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
  });

  it('rejects wall-clock times skipped by a DST jump', () => {
    // 2026-03-08 02:30 does not exist in America/New_York.
    expect(localInputToUtcIso('2026-03-08T02:30', 'America/New_York')).toBeNull();
  });

  it('uses the earlier instant for ambiguous DST-overlap times', () => {
    // 2026-11-01 01:30 happens twice in America/New_York; earlier = EDT (UTC-4) = 05:30Z.
    expect(localInputToUtcIso('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('rejects malformed or impossible input', () => {
    expect(localInputToUtcIso('', 'Asia/Jakarta')).toBeNull();
    expect(localInputToUtcIso('2026-13-01T10:00', 'Asia/Jakarta')).toBeNull();
    expect(localInputToUtcIso('2026-02-30T10:00', 'Asia/Jakarta')).toBeNull();
    expect(localInputToUtcIso('2026-10-23 10:00', 'Asia/Jakarta')).toBeNull();
    expect(localInputToUtcIso('2026-10-23T10:00', 'Nope/Zone')).toBeNull();
  });

  it('renders a dash for missing timestamps', () => {
    expect(formatDateTime(null, 'Asia/Jakarta')).toBe('—');
    expect(formatDateTime(undefined, 'Asia/Jakarta')).toBe('—');
  });
});

describe('post age', () => {
  it('is null when either timestamp is unknown (never 0)', () => {
    expect(postAgeSeconds(null, '2026-10-23T00:00:00.000Z')).toBeNull();
    expect(postAgeSeconds('2026-10-23T00:00:00.000Z', null)).toBeNull();
  });

  it('computes captured - published, including zero and negative', () => {
    const p = '2026-10-23T00:00:00.000Z';
    expect(postAgeSeconds(p, '2026-10-24T00:00:00.000Z')).toBe(86400);
    expect(postAgeSeconds(p, p)).toBe(0);
    expect(postAgeSeconds(p, '2026-10-22T23:00:00.000Z')).toBe(-3600);
  });

  it('formats ages', () => {
    expect(formatPostAge(null)).toBe('Usia post tidak diketahui');
    expect(formatPostAge(0)).toBe('0 jam');
    expect(formatPostAge(5.5 * 3600)).toBe('5,5 jam');
    expect(formatPostAge(24 * 3600)).toBe('24 jam');
    expect(formatPostAge(3 * 86400 + 4 * 3600)).toBe('3 hari 4 jam');
    expect(formatPostAge(7 * 86400)).toBe('7 hari');
  });

  it('formats gaps', () => {
    expect(formatGap('2026-10-23T00:00:00.000Z', '2026-10-23T00:45:00.000Z')).toBe('45 menit');
    expect(formatGap('2026-10-23T00:00:00.000Z', '2026-10-25T03:00:00.000Z')).toBe('2 hari 3 jam');
  });
});
