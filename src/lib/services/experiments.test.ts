import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DomainError, NotFoundError } from '../domain/errors';
import type { ExperimentInput } from '../validation/experiment';
import { experimentInputSchema, outcomeSchema } from '../validation/experiment';
import { parseInput } from '../validation/common';
import { addDist, snap, testDb } from '@/test/helpers';
import {
  addNote,
  createExperiment,
  deleteExperiment,
  getExperimentDetail,
  getExperimentEvidence,
  linkDistribution,
  listExperiments,
  recordOutcome,
  transitionExperiment,
  unlinkDistribution,
  updateExperiment,
} from './experiments';

const VIEWS = 'mdef_views';
const CTR = 'mdef_ctr';

const base = (o: Partial<ExperimentInput> = {}): ExperimentInput => ({
  title: 'Hook pertanyaan vs pernyataan',
  hypothesis: 'Hook berbentuk pertanyaan menaikkan views pada 24 jam.',
  rationale: null,
  variableToTest: 'Bentuk kalimat hook',
  targetAudience: null,
  design: 'concurrent',
  primaryMetricId: VIEWS,
  windowHours: 24,
  successType: 'min_relative_gain',
  successValue: '20',
  secondaryMetricIds: [],
  ...o,
});

function setup(db: DatabaseSync) {
  const b1 = addDist(db, 'Base 1', 'youtube', '2026-10-01T10:00');
  const b2 = addDist(db, 'Base 2', 'youtube', '2026-10-02T10:00');
  const v1 = addDist(db, 'Var 1', 'youtube', '2026-10-03T10:00');
  const v2 = addDist(db, 'Var 2', 'youtube', '2026-10-04T10:00');
  snap(db, b1.distributionId, '2026-10-02T10:00', { [VIEWS]: '100' });
  snap(db, b2.distributionId, '2026-10-03T10:00', { [VIEWS]: '100' });
  snap(db, v1.distributionId, '2026-10-04T10:00', { [VIEWS]: '150' });
  snap(db, v2.distributionId, '2026-10-05T10:00', { [VIEWS]: '130' });
  return { b1, b2, v1, v2 };
}

function runningExperiment(db: DatabaseSync, input = base()) {
  const posts = setup(db);
  const id = createExperiment(db, input);
  linkDistribution(db, id, { distributionId: posts.b1.distributionId, role: 'baseline' });
  linkDistribution(db, id, { distributionId: posts.b2.distributionId, role: 'baseline' });
  linkDistribution(db, id, { distributionId: posts.v1.distributionId, role: 'variant' });
  linkDistribution(db, id, { distributionId: posts.v2.distributionId, role: 'variant' });
  transitionExperiment(db, id, 'planned');
  transitionExperiment(db, id, 'running');
  return { id, posts };
}

describe('experiment form validation', () => {
  const parse = (o: Record<string, string>) =>
    parseInput(experimentInputSchema, { title: 'T', hypothesis: 'H', variableToTest: 'V', design: 'concurrent', primaryMetricId: VIEWS, windowHours: '24', successType: 'min_value', successValue: '100', ...o });

  it('requires hypothesis, variable, success type and value', () => {
    const r = parseInput(experimentInputSchema, { title: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors)).toEqual(expect.arrayContaining(['hypothesis', 'variableToTest', 'design', 'primaryMetricId', 'windowHours', 'successType', 'successValue']));
  });

  it('accepts a valid form and rejects unknown enum values', () => {
    expect(parse({}).ok).toBe(true);
    expect(parse({ design: 'randomized' }).ok).toBe(false);
    expect(parse({ successType: 'prose' }).ok).toBe(false);
    expect(parse({ windowHours: 'abc' }).ok).toBe(false);
  });

  it('requires learning when recording an outcome', () => {
    expect(parseInput(outcomeSchema, { decision: 'keep', learning: '  ' }).ok).toBe(false);
    expect(parseInput(outcomeSchema, { decision: 'inconclusive', learning: 'Data terlalu sedikit.' }).ok).toBe(true);
    expect(parseInput(outcomeSchema, { decision: 'win', learning: 'x' }).ok).toBe(false);
  });
});

describe('creating and editing definitions', () => {
  it('stores a structured threshold, copies the window tolerance from settings, and logs creation', () => {
    const db = testDb();
    const id = createExperiment(db, base());
    const d = getExperimentDetail(db, id);
    expect(d.experiment).toMatchObject({ status: 'draft', successType: 'min_relative_gain', successValue: 0.2, windowHours: 24, toleranceHours: 6 });
    expect(d.events.map((e) => e.kind)).toEqual(['created']);
  });

  it('parses min_value in the metric unit (ratio entered as percent, stored as fraction)', () => {
    const db = testDb();
    const id = createExperiment(db, base({ primaryMetricId: CTR, successType: 'min_value', successValue: '4,5' }));
    expect(getExperimentDetail(db, id).experiment.successValue).toBe(0.045);
    expect(() => createExperiment(db, base({ primaryMetricId: CTR, successType: 'min_value', successValue: '150' }))).toThrow(DomainError);
  });

  it('rejects bad metrics, windows, thresholds and secondary metrics with field errors', () => {
    const db = testDb();
    const fe = (o: Partial<ExperimentInput>) => {
      try {
        createExperiment(db, base(o));
        return null;
      } catch (e) {
        return (e as DomainError).fieldErrors;
      }
    };
    expect(fe({ primaryMetricId: 'nope' })).toHaveProperty('primaryMetricId');
    expect(fe({ windowHours: 99 })).toHaveProperty('windowHours');
    expect(fe({ successValue: 'banyak' })).toHaveProperty('successValue');
    expect(fe({ successValue: '-5' })).toHaveProperty('successValue');
    expect(fe({ successType: 'min_value', successValue: '1.5' })).toHaveProperty('successValue'); // counters are integers
    expect(fe({ secondaryMetricIds: [VIEWS] })).toHaveProperty('secondaryMetricIds'); // same as primary
    expect(fe({ secondaryMetricIds: ['nope'] })).toHaveProperty('secondaryMetricIds');
    expect(listExperiments(db)).toHaveLength(0); // nothing half-created
  });

  it('keeps secondary metrics and lets draft/planned definitions change, logging the edit', () => {
    const db = testDb();
    const id = createExperiment(db, base({ secondaryMetricIds: ['mdef_likes'] }));
    expect(getExperimentDetail(db, id).secondaryMetrics.map((m) => m.key)).toEqual(['likes']);
    updateExperiment(db, id, base({ title: 'Judul baru', successValue: '30', secondaryMetricIds: [] }));
    const d = getExperimentDetail(db, id);
    expect(d.experiment).toMatchObject({ title: 'Judul baru', successValue: 0.3 });
    expect(d.secondaryMetrics).toEqual([]);
    expect(d.events.map((e) => e.kind)).toEqual(['edited', 'created']);
  });

  it('locks hypothesis and success criteria once running', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    expect(() => updateExperiment(db, id, base({ successValue: '1' }))).toThrow(/dikunci/);
    expect(getExperimentDetail(db, id).experiment.successValue).toBe(0.2);
  });
});

describe('status lifecycle and decision log', () => {
  it('requires planned before running, and a baseline plus a variant before starting', () => {
    const db = testDb();
    const id = createExperiment(db, base());
    expect(() => transitionExperiment(db, id, 'running')).toThrow(/Tidak bisa berpindah/);
    transitionExperiment(db, id, 'planned');
    expect(() => transitionExperiment(db, id, 'running')).toThrow(/baseline dan satu distribusi varian/);
    const a = addDist(db, 'A', 'youtube', '2026-10-01T10:00');
    linkDistribution(db, id, { distributionId: a.distributionId, role: 'baseline' });
    expect(() => transitionExperiment(db, id, 'running')).toThrow(/varian/);
  });

  it('can only finish through the outcome form', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    expect(() => transitionExperiment(db, id, 'completed')).toThrow(/form hasil/);
    expect(() => transitionExperiment(db, id, 'inconclusive')).toThrow(/form hasil/);
  });

  it('records a decision and learning; a finished experiment is final', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    recordOutcome(db, id, { decision: 'iterate', learning: 'Hook pertanyaan menjanjikan; ulangi dengan sampel lebih besar.' }, new Date('2026-10-20T00:00:00Z'));
    const d = getExperimentDetail(db, id);
    expect(d.experiment).toMatchObject({ status: 'completed', decision: 'iterate', endedAt: '2026-10-20T00:00:00.000Z' });
    expect(d.experiment.startedAt).not.toBeNull();
    expect(() => transitionExperiment(db, id, 'cancelled')).toThrow(DomainError);
    expect(() => recordOutcome(db, id, { decision: 'keep', learning: 'x' })).toThrow(/sedang berjalan/);
    expect(() => unlinkDistribution(db, id, d.links[0]!.distributionId)).toThrow(/tidak bisa diubah/);
  });

  it('supports an inconclusive outcome as its own status', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    recordOutcome(db, id, { decision: 'inconclusive', learning: 'Sampel terlalu kecil dan baseline tidak setara.' });
    expect(getExperimentDetail(db, id).experiment).toMatchObject({ status: 'inconclusive', decision: 'inconclusive' });
  });

  it('keeps an append-only log of what happened, newest first', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    addNote(db, id, 'Hook B baru terbit.');
    recordOutcome(db, id, { decision: 'keep', learning: 'Lanjutkan.' });
    const kinds = getExperimentDetail(db, id).events.map((e) => e.kind);
    expect(kinds[0]).toBe('outcome');
    expect(kinds).toEqual(expect.arrayContaining(['created', 'link', 'status', 'note', 'outcome']));
    expect(kinds.filter((k) => k === 'status')).toHaveLength(3); // planned, running, completed
    expect(() => db.prepare("UPDATE experiment_events SET note = 'x'").run()).toThrow(/append-only/);
  });

  it('allows notes even after the experiment is finished', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    recordOutcome(db, id, { decision: 'reject', learning: 'Tidak ada perbedaan berarti.' });
    expect(() => addNote(db, id, 'Dicek ulang bulan depan.')).not.toThrow();
  });

  it('cancelling records an end time without a decision', () => {
    const db = testDb();
    const id = createExperiment(db, base());
    transitionExperiment(db, id, 'cancelled', new Date('2026-10-20T00:00:00Z'));
    expect(getExperimentDetail(db, id).experiment).toMatchObject({ status: 'cancelled', decision: null, endedAt: '2026-10-20T00:00:00.000Z' });
  });

  it('deletes only drafts or cancelled experiments', () => {
    const db = testDb();
    const draft = createExperiment(db, base());
    deleteExperiment(db, draft);
    expect(() => getExperimentDetail(db, draft)).toThrow(NotFoundError);
    const { id } = runningExperiment(db);
    expect(() => deleteExperiment(db, id)).toThrow(/Hanya eksperimen Draf atau Dibatalkan/);
  });
});

describe('database-level integrity', () => {
  it('rejects a decision without learning, an outcome/status mismatch, and negative thresholds even via raw SQL', () => {
    const db = testDb();
    const id = createExperiment(db, base());
    const upd = (sql: string) => db.prepare(`UPDATE experiments SET ${sql} WHERE id = ?`).run(id);
    expect(() => upd("status = 'completed', decision = 'keep', started_at = 'x', ended_at = 'y'")).toThrow(/CHECK/); // no learning
    expect(() => upd("status = 'completed', decision = 'inconclusive', learning = 'l', started_at = 'x', ended_at = 'y'")).toThrow(/CHECK/); // mismatch
    expect(() => upd("status = 'inconclusive', decision = 'keep', learning = 'l', started_at = 'x', ended_at = 'y'")).toThrow(/CHECK/);
    expect(() => upd("status = 'running'")).toThrow(/CHECK/); // running needs started_at
    expect(() => upd('success_value = -1')).toThrow(/CHECK/);
    expect(() => upd("success_type = 'free_text'")).toThrow(/CHECK/);
  });
});

describe('linking rules', () => {
  it('lets a role be changed, and unlinking logs it', () => {
    const db = testDb();
    const a = addDist(db, 'A', 'youtube', '2026-10-01T10:00');
    const id = createExperiment(db, base());
    linkDistribution(db, id, { distributionId: a.distributionId, role: 'baseline' });
    linkDistribution(db, id, { distributionId: a.distributionId, role: 'variant' });
    expect(getExperimentDetail(db, id).links.map((l) => l.role)).toEqual(['variant']);
    unlinkDistribution(db, id, a.distributionId);
    expect(getExperimentDetail(db, id).links).toEqual([]);
    expect(() => unlinkDistribution(db, id, a.distributionId)).toThrow(NotFoundError);
  });

  it('rejects unknown distributions and platform-mismatched links for platform-specific metrics', () => {
    const db = testDb();
    const finish = (db.prepare("SELECT id FROM metric_definitions WHERE key = 'views'").get() as { id: string }).id;
    expect(finish).toBe(VIEWS);
    db.prepare(
      "INSERT INTO metric_definitions (id, platform_id, key, label, unit, aggregation_kind, allow_negative, is_active, created_at, updated_at) VALUES ('m_tt','tiktok','tt_only','TT only','x','counter',0,1,'t','t')",
    ).run();
    const id = createExperiment(db, base({ primaryMetricId: 'm_tt', successType: 'min_value', successValue: '10' }));
    const yt = addDist(db, 'YT', 'youtube', '2026-10-01T10:00');
    const tt = addDist(db, 'TT', 'tiktok', '2026-10-01T10:00');
    expect(() => linkDistribution(db, id, { distributionId: yt.distributionId, role: 'variant' })).toThrow(/khusus TikTok/);
    expect(() => linkDistribution(db, id, { distributionId: 'nope', role: 'variant' })).toThrow(/tidak ditemukan/);
    expect(() => linkDistribution(db, id, { distributionId: tt.distributionId, role: 'variant' })).not.toThrow();
    expect(getExperimentDetail(db, id).linkable.every((d) => d.platformId === 'tiktok')).toBe(true);
  });

  it('removes links (not the content) when the distribution is deleted', () => {
    const db = testDb();
    const a = addDist(db, 'A', 'youtube', '2026-10-01T10:00');
    const id = createExperiment(db, base());
    linkDistribution(db, id, { distributionId: a.distributionId, role: 'baseline' });
    db.prepare('DELETE FROM distributions WHERE id = ?').run(a.distributionId);
    expect(getExperimentDetail(db, id).links).toEqual([]);
  });
});

describe('evidence', () => {
  it('computes medians per platform and an indication against the declared threshold', () => {
    const db = testDb();
    const { id } = runningExperiment(db);
    const { evidence, successDescription, links } = getExperimentEvidence(db, id);
    expect(successDescription).toBe('Median Views varian minimal 20% lebih tinggi daripada median baseline pada usia 24 jam ± 6 jam, dalam platform yang sama.');
    expect(links).toHaveLength(4);
    const yt = evidence.platforms[0]!;
    expect(yt).toMatchObject({ platformId: 'youtube', baseline: { comparable: 2, median: 100 }, variant: { comparable: 2, median: 140 }, verdict: 'meets' });
    expect(yt.relativeGain).toBeCloseTo(0.4);
    expect(evidence.limitations[0]).toMatch(/bukan bukti sebab-akibat/);
  });

  it('does not report success from an unknown variant value (missing ≠ 0 ≠ met)', () => {
    const db = testDb();
    const b = addDist(db, 'B', 'youtube', '2026-10-01T10:00');
    const v = addDist(db, 'V', 'youtube', '2026-10-02T10:00');
    snap(db, b.distributionId, '2026-10-02T10:00', { [VIEWS]: '100' });
    snap(db, v.distributionId, '2026-10-03T10:00', { mdef_likes: '5' }); // views not recorded
    const id = createExperiment(db, base());
    linkDistribution(db, id, { distributionId: b.distributionId, role: 'baseline' });
    linkDistribution(db, id, { distributionId: v.distributionId, role: 'variant' });
    const yt = getExperimentEvidence(db, id).evidence.platforms[0]!;
    expect(yt).toMatchObject({ verdict: 'insufficient', insufficientReason: 'no_variant_value' });
  });

  it('judges each platform on its own and reports secondary metrics at the same window', () => {
    const db = testDb();
    const yb = addDist(db, 'YB', 'youtube', '2026-10-01T10:00');
    const yv = addDist(db, 'YV', 'youtube', '2026-10-01T12:00');
    const tb = addDist(db, 'TB', 'tiktok', '2026-10-01T10:00');
    const tv = addDist(db, 'TV', 'tiktok', '2026-10-01T12:00');
    snap(db, yb.distributionId, '2026-10-02T10:00', { [VIEWS]: '100', mdef_likes: '10' });
    snap(db, yv.distributionId, '2026-10-02T12:00', { [VIEWS]: '300', mdef_likes: '40' });
    snap(db, tb.distributionId, '2026-10-02T10:00', { [VIEWS]: '1000' });
    snap(db, tv.distributionId, '2026-10-02T12:00', { [VIEWS]: '1050' });
    const id = createExperiment(db, base({ secondaryMetricIds: ['mdef_likes'] }));
    for (const [d, role] of [[yb, 'baseline'], [yv, 'variant'], [tb, 'baseline'], [tv, 'variant']] as const) {
      linkDistribution(db, id, { distributionId: d.distributionId, role });
    }
    const ev = getExperimentEvidence(db, id);
    expect(ev.evidence.platforms.map((p) => [p.platformId, p.verdict])).toEqual([['tiktok', 'does_not_meet'], ['youtube', 'meets']]);
    const ytVariant = ev.links.find((l) => l.episodeTitle === 'YV')!;
    expect(ytVariant.secondary[0]!.metric.key).toBe('likes');
    expect(ytVariant.secondary[0]!.result).toMatchObject({ ok: true, value: 40 });
  });

  it('describes min_value thresholds with units (ratio shown as percent)', () => {
    const db = testDb();
    const id = createExperiment(db, base({ primaryMetricId: CTR, successType: 'min_value', successValue: '4,5' }));
    expect(getExperimentEvidence(db, id).successDescription).toBe('Median Click-through rate varian ≥ 4,5% (ratio) pada usia 24 jam ± 6 jam.');
  });

  it('uses the reading closest to the target age and keeps supporting links out of the verdict', () => {
    const db = testDb();
    const { id, posts } = runningExperiment(db);
    snap(db, posts.v1.distributionId, '2026-10-04T14:00', { [VIEWS]: '999' }); // also in the window, but 4h from target vs 0h
    const extra = addDist(db, 'Support', 'youtube', '2026-10-05T10:00');
    snap(db, extra.distributionId, '2026-10-06T10:00', { [VIEWS]: '1000000' });
    linkDistribution(db, id, { distributionId: extra.distributionId, role: 'supporting' });
    const yt = getExperimentEvidence(db, id).evidence.platforms[0]!;
    expect(yt.variant).toMatchObject({ comparable: 2, median: 140 }); // 150 (exact 24h) beat 999 (28h); not 999
    expect(yt.baseline.median).toBe(100); // the 1,000,000 supporting post is not in the comparison
  });
});
