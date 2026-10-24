import { describe, expect, it } from 'vitest';
import type { EquivalentResult } from '../analytics/equivalent-age';
import type { PlatformId } from '../domain/types';
import { evaluateEvidence, MIN_GROUP_SAMPLE, type LinkedReading } from './evidence';
import {
  EXPERIMENT_STATUSES,
  allowedTransitions,
  areLinksEditable,
  canTransition,
  isDefinitionEditable,
  isFinished,
  statusForDecision,
} from './model';

const ok = (value: number): EquivalentResult => ({ ok: true, value, snapshotId: 's', capturedAt: '2026-10-02T00:00:00.000Z', actualAgeHours: 24, deltaHours: 0, candidateCount: 1 });
const missing: EquivalentResult = { ok: false, reason: 'value_unknown', nearestAgeHours: null };

let n = 0;
const r = (role: LinkedReading['role'], result: EquivalentResult, platformId: PlatformId = 'youtube', publishedAt: string | null = '2026-10-01T00:00:00.000Z'): LinkedReading => ({
  distributionId: `d${n++}`,
  platformId,
  role,
  publishedAt,
  result,
});

describe('status transitions', () => {
  it('allows only the documented moves', () => {
    expect(allowedTransitions('draft')).toEqual(['planned', 'cancelled']);
    expect(canTransition('planned', 'running')).toBe(true);
    expect(canTransition('draft', 'running')).toBe(false); // must be planned first
    expect(canTransition('running', 'inconclusive')).toBe(true);
    expect(canTransition('running', 'draft')).toBe(false);
  });

  it('treats finished states as terminal', () => {
    for (const s of ['completed', 'inconclusive', 'cancelled'] as const) {
      expect(isFinished(s)).toBe(true);
      expect(allowedTransitions(s)).toEqual([]);
      expect(areLinksEditable(s)).toBe(false);
      for (const to of EXPERIMENT_STATUSES) expect(canTransition(s, to)).toBe(false);
    }
  });

  it('locks the definition once the experiment runs', () => {
    expect(isDefinitionEditable('draft')).toBe(true);
    expect(isDefinitionEditable('planned')).toBe(true);
    expect(isDefinitionEditable('running')).toBe(false);
    expect(areLinksEditable('running')).toBe(true);
  });

  it('maps decisions to statuses (inconclusive is a first-class outcome)', () => {
    expect(statusForDecision('inconclusive')).toBe('inconclusive');
    for (const d of ['keep', 'iterate', 'reject'] as const) expect(statusForDecision(d)).toBe('completed');
  });
});

describe('evaluateEvidence — min_value', () => {
  const success = { type: 'min_value' as const, value: 1000 };

  it('compares the variant median with the threshold, per platform', () => {
    const e = evaluateEvidence([r('variant', ok(900)), r('variant', ok(1200)), r('variant', ok(1100))], success, 'concurrent');
    expect(e.platforms[0]).toMatchObject({ platformId: 'youtube', verdict: 'meets', variant: { comparable: 3, median: 1100 } });
    const below = evaluateEvidence([r('variant', ok(10)), r('variant', ok(20)), r('variant', ok(30))], success, 'concurrent');
    expect(below.platforms[0]!.verdict).toBe('does_not_meet');
  });

  it('is insufficient without a variant or without comparable variant values', () => {
    expect(evaluateEvidence([r('baseline', ok(5))], success, 'concurrent').platforms[0]).toMatchObject({ verdict: 'insufficient', insufficientReason: 'no_variant' });
    const e = evaluateEvidence([r('variant', missing)], success, 'concurrent').platforms[0]!;
    expect(e).toMatchObject({ verdict: 'insufficient', insufficientReason: 'no_variant_value' });
  });

  it('does not count a missing variant as 0 — it is excluded and called out', () => {
    const e = evaluateEvidence([r('variant', ok(2000)), r('variant', missing)], success, 'concurrent').platforms[0]!;
    expect(e.variant).toMatchObject({ linked: 2, comparable: 1, median: 2000 });
    expect(e.warnings.join(' ')).toMatch(/1 varian tidak punya nilai sebanding/);
  });

  it('treats a measured zero as a real value', () => {
    const e = evaluateEvidence([r('variant', ok(0))], { type: 'min_value', value: 0 }, 'concurrent').platforms[0]!;
    expect(e).toMatchObject({ verdict: 'meets', variant: { comparable: 1, median: 0 } });
  });
});

describe('evaluateEvidence — min_relative_gain', () => {
  const success = { type: 'min_relative_gain' as const, value: 0.2 };

  it('computes the gain from the medians', () => {
    const e = evaluateEvidence([r('baseline', ok(100)), r('baseline', ok(100)), r('baseline', ok(100)), r('variant', ok(130)), r('variant', ok(125)), r('variant', ok(140))], success, 'concurrent').platforms[0]!;
    expect(e.relativeGain).toBeCloseTo(0.3);
    expect(e.verdict).toBe('meets');
    const low = evaluateEvidence([r('baseline', ok(100)), r('variant', ok(110))], success, 'concurrent').platforms[0]!;
    expect(low).toMatchObject({ verdict: 'does_not_meet' });
    expect(low.relativeGain).toBeCloseTo(0.1);
  });

  it('is insufficient (not "met") when the baseline is zero, negative, missing or unknown', () => {
    const reasons = (rs: LinkedReading[]) => evaluateEvidence(rs, success, 'concurrent').platforms[0]!.insufficientReason;
    expect(reasons([r('baseline', ok(0)), r('variant', ok(50))])).toBe('baseline_zero');
    expect(reasons([r('baseline', ok(-5)), r('variant', ok(50))])).toBe('baseline_negative');
    expect(reasons([r('variant', ok(50))])).toBe('no_baseline');
    expect(reasons([r('baseline', missing), r('variant', ok(50))])).toBe('no_baseline_value');
  });
});

describe('evaluateEvidence — platform separation and limitations', () => {
  const success = { type: 'min_value' as const, value: 100 };

  it('never merges platforms: each is judged on its own readings', () => {
    const e = evaluateEvidence(
      [r('variant', ok(5000), 'tiktok'), r('variant', ok(5000), 'tiktok'), r('variant', ok(5000), 'tiktok'), r('variant', ok(10), 'youtube')],
      success,
      'concurrent',
    );
    expect(e.platforms.map((p) => [p.platformId, p.verdict])).toEqual([
      ['tiktok', 'meets'],
      ['youtube', 'does_not_meet'],
    ]);
    expect(e.limitations.join(' ')).toMatch(/tidak digabung/);
  });

  it('always states that the result is not causal', () => {
    const e = evaluateEvidence([r('variant', ok(500))], success, 'concurrent');
    expect(e.limitations[0]).toMatch(/bukan bukti sebab-akibat/);
  });

  it('adds a before/after limitation that denies an effect reading', () => {
    const e = evaluateEvidence([r('variant', ok(500))], success, 'before_after');
    expect(e.limitations.join(' ')).toMatch(/tidak dapat memisahkan efek variabel/);
    expect(evaluateEvidence([r('variant', ok(500))], success, 'concurrent').limitations.join(' ')).not.toMatch(/sebelum\/sesudah tidak/);
  });

  it('flags small samples and "concurrent" designs whose posts are far apart in time', () => {
    const e = evaluateEvidence(
      [r('baseline', ok(10), 'youtube', '2026-09-01T00:00:00.000Z'), r('variant', ok(500), 'youtube', '2026-10-01T00:00:00.000Z')],
      success,
      'concurrent',
    );
    expect(e.platforms[0]!.warnings.join(' ')).toMatch(/berjarak > 7 hari/);
    expect(e.limitations.join(' ')).toMatch(new RegExp(`< ${MIN_GROUP_SAMPLE} post sebanding`));
  });
});
