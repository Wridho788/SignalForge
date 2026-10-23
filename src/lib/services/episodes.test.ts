import { describe, expect, it } from 'vitest';
import { DomainError, NotFoundError } from '../domain/errors';
import { episodeInputSchema } from '../validation/episode';
import { parseInput } from '../validation/common';
import { episodeInput, seedDistribution, testDb } from '@/test/helpers';
import {
  createEpisode,
  deleteEpisode,
  getEpisodeDetail,
  listEpisodes,
  listTags,
  previewEpisodeDelete,
  updateEpisode,
} from './episodes';

describe('episode validation', () => {
  const parse = (o: Record<string, string>) => parseInput(episodeInputSchema, { title: 'T', ...o });

  it('requires a title', () => {
    const r = parseInput(episodeInputSchema, { title: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.title).toMatch(/wajib/i);
  });

  it('turns blank optional fields into null, not empty strings', () => {
    const r = parse({ premise: '  ', episodeCode: '', durationSeconds: '', notes: '' });
    expect(r).toMatchObject({ ok: true, data: { premise: null, episodeCode: null, durationSeconds: null, notes: null } });
  });

  it('accepts duration as seconds or mm:ss and keeps 0', () => {
    expect(parse({ durationSeconds: '90' })).toMatchObject({ ok: true, data: { durationSeconds: 90 } });
    expect(parse({ durationSeconds: '1:30' })).toMatchObject({ ok: true, data: { durationSeconds: 90 } });
    expect(parse({ durationSeconds: '0' })).toMatchObject({ ok: true, data: { durationSeconds: 0 } });
    expect(parse({ durationSeconds: '1:75' }).ok).toBe(false);
    expect(parse({ durationSeconds: '-5' }).ok).toBe(false);
    expect(parse({ durationSeconds: '999999' }).ok).toBe(false);
  });

  it('validates episode code format and splits/dedupes tags', () => {
    expect(parse({ episodeCode: 'EP 01' }).ok).toBe(false);
    expect(parse({ episodeCode: 'EP-01' }).ok).toBe(true);
    const r = parse({ tags: ' Horor, horor ,  Misteri  kota ,, ' });
    expect(r).toMatchObject({ ok: true, data: { tags: ['Horor', 'Misteri kota'] } });
  });
});

describe('episode service', () => {
  it('creates, reads and updates an episode with tags', () => {
    const db = testDb();
    const id = createEpisode(db, episodeInput({ title: 'Satu', episodeCode: 'EP-01', tags: ['horor', 'kota'] }));
    let detail = getEpisodeDetail(db, id);
    expect(detail.episode).toMatchObject({ title: 'Satu', episodeCode: 'EP-01', durationSeconds: null });
    expect(detail.tags).toEqual(['horor', 'kota']);

    updateEpisode(db, id, episodeInput({ title: 'Satu v2', episodeCode: 'EP-01', durationSeconds: 0, tags: ['kota'] }));
    detail = getEpisodeDetail(db, id);
    expect(detail.episode.title).toBe('Satu v2');
    expect(detail.episode.durationSeconds).toBe(0); // measured zero stays 0
    expect(detail.tags).toEqual(['kota']);
    expect(listTags(db).map((t) => t.name)).toEqual(['kota']); // orphan tag 'horor' removed
  });

  it('rejects duplicate episode codes case-insensitively, but allows many without a code', () => {
    const db = testDb();
    createEpisode(db, episodeInput({ title: 'A', episodeCode: 'EP-01' }));
    expect(() => createEpisode(db, episodeInput({ title: 'B', episodeCode: 'ep-01' }))).toThrow(DomainError);
    createEpisode(db, episodeInput({ title: 'C' }));
    createEpisode(db, episodeInput({ title: 'D' }));
    expect(listEpisodes(db)).toHaveLength(3);
  });

  it('lets an episode keep its own code on update but not take another', () => {
    const db = testDb();
    const a = createEpisode(db, episodeInput({ title: 'A', episodeCode: 'EP-01' }));
    createEpisode(db, episodeInput({ title: 'B', episodeCode: 'EP-02' }));
    expect(() => updateEpisode(db, a, episodeInput({ title: 'A2', episodeCode: 'EP-01' }))).not.toThrow();
    expect(() => updateEpisode(db, a, episodeInput({ title: 'A3', episodeCode: 'EP-02' }))).toThrow(DomainError);
  });

  it('rolls back the whole create when a later step fails', () => {
    const db = testDb();
    createEpisode(db, episodeInput({ title: 'A', episodeCode: 'EP-01' }));
    expect(() => createEpisode(db, episodeInput({ title: 'B', episodeCode: 'EP-01', tags: ['x'] }))).toThrow();
    expect(listEpisodes(db)).toHaveLength(1);
    expect(listTags(db)).toHaveLength(0);
  });

  it('searches literally (LIKE wildcards are escaped) and filters by tag', () => {
    const db = testDb();
    createEpisode(db, episodeInput({ title: '100% Horor', tags: ['horor'] }));
    createEpisode(db, episodeInput({ title: 'Komedi', tags: ['lucu'] }));
    expect(listEpisodes(db, { q: '100%' }).map((e) => e.title)).toEqual(['100% Horor']);
    expect(listEpisodes(db, { q: '%' }).map((e) => e.title)).toEqual(['100% Horor']);
    expect(listEpisodes(db, { q: '_' })).toHaveLength(0);
    expect(listEpisodes(db, { tag: 'lucu' }).map((e) => e.title)).toEqual(['Komedi']);
    expect(listEpisodes(db, { tag: 'LUCU' }).map((e) => e.title)).toEqual(['Komedi']);
  });

  it('throws NotFoundError for missing episodes', () => {
    const db = testDb();
    expect(() => getEpisodeDetail(db, 'nope')).toThrow(NotFoundError);
    expect(() => updateEpisode(db, 'nope', episodeInput())).toThrow(NotFoundError);
    expect(() => deleteEpisode(db, 'nope')).toThrow(NotFoundError);
  });

  it('previews and performs a cascading delete', () => {
    const db = testDb();
    const { episodeId } = seedDistribution(db);
    expect(previewEpisodeDelete(db, episodeId)).toMatchObject({ distributionCount: 1, snapshotCount: 0 });
    deleteEpisode(db, episodeId);
    expect(listEpisodes(db)).toHaveLength(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM distributions').get() as { n: number }).n).toBe(0);
  });
});
