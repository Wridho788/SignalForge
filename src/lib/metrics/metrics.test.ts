import { describe, expect, it } from 'vitest';
import { formatMetricValue } from './format';
import { compareMetricDefinitions } from './order';
import { parseMetricInput, type MetricShape } from './parse';

const counter: MetricShape = { aggregationKind: 'counter', allowNegative: false, currencyCode: null };
const signedCounter: MetricShape = { aggregationKind: 'counter', allowNegative: true, currencyCode: null };
const duration: MetricShape = { aggregationKind: 'duration', allowNegative: false, currencyCode: null };
const ratio: MetricShape = { aggregationKind: 'ratio', allowNegative: false, currencyCode: null };
const money: MetricShape = { aggregationKind: 'currency', allowNegative: false, currencyCode: 'IDR' };
const category: MetricShape = { aggregationKind: 'categorical', allowNegative: false, currencyCode: null };

describe('parseMetricInput', () => {
  it('keeps a measured zero as 0 (not unknown)', () => {
    expect(parseMetricInput('0', counter)).toEqual({ ok: true, numericValue: 0, textValue: null });
    expect(parseMetricInput('-0', signedCounter)).toEqual({ ok: true, numericValue: 0, textValue: null });
  });

  it('never treats blank as a value', () => {
    expect(parseMetricInput('', counter).ok).toBe(false);
    expect(parseMetricInput('   ', counter).ok).toBe(false);
  });

  it('accepts integers only for counters and rejects ambiguous separators', () => {
    expect(parseMetricInput('1234', counter)).toMatchObject({ ok: true, numericValue: 1234 });
    for (const bad of ['1.234', '1,234', '12.5', '1e3', 'abc', '12 34']) {
      expect(parseMetricInput(bad, counter).ok).toBe(false);
    }
  });

  it('rejects negatives unless the metric allows them', () => {
    expect(parseMetricInput('-5', counter).ok).toBe(false);
    expect(parseMetricInput('-5', signedCounter)).toMatchObject({ ok: true, numericValue: -5 });
  });

  it('accepts decimal comma or dot for durations', () => {
    expect(parseMetricInput('12,5', duration)).toMatchObject({ ok: true, numericValue: 12.5 });
    expect(parseMetricInput('12.5', duration)).toMatchObject({ ok: true, numericValue: 12.5 });
  });

  it('stores percentages as fractions and rejects out-of-range', () => {
    expect(parseMetricInput('12,5', ratio)).toMatchObject({ ok: true, numericValue: 0.125 });
    expect(parseMetricInput('0', ratio)).toMatchObject({ ok: true, numericValue: 0 });
    expect(parseMetricInput('100', ratio)).toMatchObject({ ok: true, numericValue: 1 });
    expect(parseMetricInput('33,3', ratio)).toMatchObject({ ok: true, numericValue: 0.333 });
    expect(parseMetricInput('100,1', ratio).ok).toBe(false);
    expect(parseMetricInput('-1', ratio).ok).toBe(false);
  });

  it('rejects absurd magnitudes', () => {
    expect(parseMetricInput('9'.repeat(30), counter).ok).toBe(false);
  });

  it('handles currency and categorical', () => {
    expect(parseMetricInput('15000,50', money)).toMatchObject({ ok: true, numericValue: 15000.5 });
    expect(parseMetricInput('Reels', category)).toEqual({ ok: true, numericValue: null, textValue: 'Reels' });
    expect(parseMetricInput('x'.repeat(201), category).ok).toBe(false);
  });
});

describe('compareMetricDefinitions', () => {
  const m = (key: string, label: string, platformId: string | null = null) => ({ key, label, platformId });

  it('puts views first, platform-specific last, and others alphabetically after the priority list', () => {
    const sorted = [
      m('finish_rate', 'Finish rate', 'tiktok'),
      m('zeta', 'Zeta'),
      m('click_through_rate', 'Click-through rate'),
      m('likes', 'Likes'),
      m('views', 'Views'),
      m('alpha', 'Alpha'),
    ].sort(compareMetricDefinitions);
    expect(sorted.map((x) => x.key)).toEqual(['views', 'likes', 'click_through_rate', 'alpha', 'zeta', 'finish_rate']);
  });
});

describe('formatMetricValue', () => {
  const views = { aggregationKind: 'counter' as const, currencyCode: null, unit: 'views' };

  it('distinguishes unknown, zero and values', () => {
    expect(formatMetricValue(views, undefined)).toMatchObject({ text: '—', known: false });
    expect(formatMetricValue(views, { valueState: 'unknown', numericValue: null, textValue: null })).toMatchObject({
      text: '—',
      known: false,
    });
    expect(formatMetricValue(views, { valueState: 'known', numericValue: 0, textValue: null })).toMatchObject({
      text: '0',
      known: true,
    });
    expect(formatMetricValue(views, { valueState: 'known', numericValue: 1234, textValue: null }).text).toBe('1.234');
  });

  it('labels not_available and not_applicable in text (not color only)', () => {
    expect(formatMetricValue(views, { valueState: 'not_available', numericValue: null, textValue: null }).text).toBe('N/A');
    expect(
      formatMetricValue(views, { valueState: 'not_applicable', numericValue: null, textValue: null }).text,
    ).toBe('Tidak berlaku');
  });

  it('formats ratio as percent and duration with unit', () => {
    const r = { aggregationKind: 'ratio' as const, currencyCode: null, unit: 'ratio' };
    expect(formatMetricValue(r, { valueState: 'known', numericValue: 0.125, textValue: null }).text).toBe('12,5%');
    const d = { aggregationKind: 'duration' as const, currencyCode: null, unit: 'seconds' };
    expect(formatMetricValue(d, { valueState: 'known', numericValue: 90, textValue: null }).text).toBe('90 detik');
  });
});
