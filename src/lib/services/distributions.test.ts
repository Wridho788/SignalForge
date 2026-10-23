import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { distributionInputSchema } from '../validation/distribution';
import { parseInput } from '../validation/common';
import { distributionInput, episodeInput, NOW, seedDistribution, testDb, TZ } from '@/test/helpers';
import { createEpisode, getEpisodeDetail } from './episodes';
import {
  createDistribution,
  deleteDistribution,
  getDistribution,
  previewDistributionDelete,
  updateDistribution,
} from './distributions';

describe('distribution validation', () => {
  const parse = (o: Record<string, string>) =>
    parseInput(distributionInputSchema, { platformId: 'youtube', status: 'published', ...o });

  it('accepts only the three platforms', () => {
    expect(parse({ platformId: 'instagram' }).ok).toBe(false);
    for (const p of ['facebook', 'youtube', 'tiktok']) expect(parse({ platformId: p }).ok).toBe(true);
  });

  it('accepts only http(s) post URLs (no javascript:, no file:)', () => {
    expect(parse({ postUrl: 'https://youtube.com/shorts/abc' }).ok).toBe(true);
    expect(parse({ postUrl: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parse({ postUrl: 'file:///etc/passwd' }).ok).toBe(false);
    expect(parse({ postUrl: 'not a url' }).ok).toBe(false);
    expect(parse({ postUrl: '' })).toMatchObject({ ok: true, data: { postUrl: null } });
  });
});

describe('distribution service', () => {
  it('stores published_at in UTC converted from the selected time zone', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db, { publishedAtLocal: '2026-10-01T10:00' });
    expect(getDistribution(db, distributionId).publishedAt).toBe('2026-10-01T03:00:00.000Z');
  });

  it('keeps unknown published_at as null', () => {
    const db = testDb();
    const { distributionId } = seedDistribution(db, { publishedAtLocal: null, status: 'unknown' });
    expect(getDistribution(db, distributionId).publishedAt).toBeNull();
  });

  it('rejects non-existent local times and future published posts', () => {
    const db = testDb();
    const episodeId = createEpisode(db, episodeInput());
    expect(() =>
      createDistribution(db, episodeId, distributionInput({ publishedAtLocal: '2026-02-30T10:00' }), TZ, NOW),
    ).toThrow(DomainError);
    expect(() =>
      createDistribution(db, episodeId, distributionInput({ publishedAtLocal: '2026-11-01T10:00' }), TZ, NOW),
    ).toThrow(/masa depan/);
    // A draft may carry a future date.
    expect(() =>
      createDistribution(
        db,
        episodeId,
        distributionInput({ status: 'draft', publishedAtLocal: '2026-11-01T10:00' }),
        TZ,
        NOW,
      ),
    ).not.toThrow();
  });

  it('prevents duplicate episode+platform unless a distinct variant label is given', () => {
    const db = testDb();
    const { episodeId } = seedDistribution(db, { platformId: 'tiktok' });
    expect(() => createDistribution(db, episodeId, distributionInput({ platformId: 'tiktok' }), TZ, NOW)).toThrow(
      DomainError,
    );
    // other platform is fine
    createDistribution(db, episodeId, distributionInput({ platformId: 'facebook' }), TZ, NOW);
    // variant is fine, but not twice (case-insensitive)
    createDistribution(db, episodeId, distributionInput({ platformId: 'tiktok', variantLabel: 'Repost' }), TZ, NOW);
    expect(() =>
      createDistribution(db, episodeId, distributionInput({ platformId: 'tiktok', variantLabel: 'repost' }), TZ, NOW),
    ).toThrow(DomainError);
    expect(getEpisodeDetail(db, episodeId).distributions).toHaveLength(3);
  });

  it('update may keep its own identity but cannot collide with a sibling', () => {
    const db = testDb();
    const { episodeId, distributionId } = seedDistribution(db, { platformId: 'tiktok' });
    const other = createDistribution(db, episodeId, distributionInput({ platformId: 'youtube' }), TZ, NOW);
    expect(() => updateDistribution(db, distributionId, distributionInput({ platformId: 'tiktok', postUrl: 'https://tiktok.com/x' }), TZ, NOW)).not.toThrow();
    expect(() => updateDistribution(db, other, distributionInput({ platformId: 'tiktok' }), TZ, NOW)).toThrow(DomainError);
  });

  it('previews and performs delete', () => {
    const db = testDb();
    const { episodeId, distributionId } = seedDistribution(db);
    expect(previewDistributionDelete(db, distributionId)).toMatchObject({ snapshotCount: 0, label: 'YouTube' });
    expect(deleteDistribution(db, distributionId)).toBe(episodeId);
    expect(getEpisodeDetail(db, episodeId).distributions).toHaveLength(0);
  });
});
