import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { metricDefinitionCreateSchema } from '../validation/metric-definition';
import { parseInput } from '../validation/common';
import { testDb } from '@/test/helpers';
import {
  createMetricDefinition,
  getMetricDefinition,
  listMetricDefinitions,
  updateMetricDefinition,
} from './metric-definitions';

const base = { key: 'custom_metric', label: 'Custom', unit: 'things', aggregationKind: 'counter' };
const create = (o: Record<string, string> = {}) => {
  const r = parseInput(metricDefinitionCreateSchema, { ...base, ...o });
  return r;
};

describe('metric definition validation', () => {
  it('requires a currency code only for currency metrics', () => {
    expect(create({ aggregationKind: 'currency' }).ok).toBe(false);
    expect(create({ aggregationKind: 'currency', currencyCode: 'idr' })).toMatchObject({ ok: true, data: { currencyCode: 'IDR' } });
    expect(create({ currencyCode: 'IDR' }).ok).toBe(false);
  });

  it('normalizes and validates keys', () => {
    expect(create({ key: ' Watch_Time ' })).toMatchObject({ ok: true, data: { key: 'watch_time' } });
    expect(create({ key: '1abc' }).ok).toBe(false);
    expect(create({ key: 'has space' }).ok).toBe(false);
  });
});

describe('metric definition service', () => {
  it('seeds shared definitions without a source definition', () => {
    const defs = listMetricDefinitions(testDb());
    expect(defs.find((d) => d.key === 'views')).toMatchObject({ platformId: null, sourceDefinition: null, isActive: true });
    expect(defs.every((d) => d.unit.length > 0)).toBe(true);
    expect(defs.find((d) => d.key === 'followers_gained')!.allowNegative).toBe(true);
  });

  it('creates platform-specific definitions and scopes them in listings', () => {
    const db = testDb();
    const r = create({ key: 'finish_rate', aggregationKind: 'ratio', platformId: 'tiktok' });
    if (!r.ok) throw new Error('invalid');
    const id = createMetricDefinition(db, r.data);
    expect(getMetricDefinition(db, id).platformName).toBe('TikTok');
    expect(listMetricDefinitions(db, { applicableTo: 'tiktok' }).some((d) => d.id === id)).toBe(true);
    expect(listMetricDefinitions(db, { applicableTo: 'youtube' }).some((d) => d.id === id)).toBe(false);
  });

  it('rejects key clashes across shared and platform scopes', () => {
    const db = testDb();
    const shared = create({ key: 'views' });
    if (!shared.ok) throw new Error('invalid');
    expect(() => createMetricDefinition(db, shared.data)).toThrow(DomainError);
    const scoped = create({ key: 'views', platformId: 'youtube' });
    if (!scoped.ok) throw new Error('invalid');
    expect(() => createMetricDefinition(db, scoped.data)).toThrow(DomainError);
  });

  it('updates only descriptive fields and the active flag', () => {
    const db = testDb();
    updateMetricDefinition(db, 'mdef_views', {
      label: 'Views (YouTube Studio)',
      description: null,
      sourceDefinition: 'Tayangan sesuai YouTube Studio, 28 hari terakhir.',
      formulaVersion: 'v1',
      isActive: false,
    });
    const d = getMetricDefinition(db, 'mdef_views');
    expect(d).toMatchObject({ label: 'Views (YouTube Studio)', isActive: false, aggregationKind: 'counter', unit: 'views', formulaVersion: 'v1' });
    expect(d.sourceDefinition).toMatch(/YouTube Studio/);
  });
});
