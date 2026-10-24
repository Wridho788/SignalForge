import { describe, expect, it } from 'vitest';
import { compactNumber, linear, niceTicks } from './scale';

describe('niceTicks', () => {
  it('covers the data with clean steps', () => {
    expect(niceTicks(0, 87, 4)).toEqual({ ticks: [0, 25, 50, 75, 100], min: 0, max: 100 });
    expect(niceTicks(0, 1, 4).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 1200, 4).ticks).toEqual([0, 500, 1000, 1500]);
  });

  it('handles a flat series without a zero-height domain', () => {
    const t = niceTicks(5, 5);
    expect(t.max).toBeGreaterThan(t.min);
    expect(t.ticks.length).toBeGreaterThan(1);
  });

  it('handles negative ranges', () => {
    const t = niceTicks(-30, 70, 4);
    expect(t.min).toBeLessThanOrEqual(-30);
    expect(t.max).toBeGreaterThanOrEqual(70);
    expect(t.ticks).toContain(0);
  });

  it('survives non-finite input', () => {
    expect(niceTicks(Number.NaN, 1).ticks).toEqual([0, 1]);
  });
});

describe('compactNumber', () => {
  it.each([
    [0, '0'],
    [12, '12'],
    [0.25, '0,25'],
    [1000, '1K'],
    [2500, '2,5K'],
    [1_200_000, '1,2M'],
    [3_000_000_000, '3B'],
    [-1500, '-1,5K'],
  ])('%s → %s', (n, expected) => {
    expect(compactNumber(n)).toBe(expected);
  });
});

describe('linear', () => {
  it('maps a domain to a range (including inverted ranges for SVG y)', () => {
    expect(linear(0, 10, 0, 100)(5)).toBe(50);
    expect(linear(0, 10, 200, 0)(2.5)).toBe(150);
    expect(linear(3, 3, 0, 100)(3)).toBe(0); // zero-width domain does not produce NaN
  });
});
