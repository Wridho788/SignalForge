import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '@/lib/db/open';
import { createDistribution } from '@/lib/services/distributions';
import { createEpisode } from '@/lib/services/episodes';
import type { DistributionInput } from '@/lib/validation/distribution';
import type { EpisodeInput } from '@/lib/validation/episode';

export const TZ = 'Asia/Jakarta';

export function testDb(): DatabaseSync {
  return openDatabase(':memory:');
}

export function episodeInput(overrides: Partial<EpisodeInput> = {}): EpisodeInput {
  return {
    title: 'Episode Satu',
    workingTitle: null,
    episodeCode: null,
    premise: null,
    format: null,
    durationSeconds: null,
    scriptText: null,
    notes: null,
    tags: [],
    ...overrides,
  };
}

export function distributionInput(overrides: Partial<DistributionInput> = {}): DistributionInput {
  return {
    platformId: 'youtube',
    status: 'published',
    postUrl: null,
    publishedAtLocal: '2026-10-01T10:00',
    externalPostId: null,
    variantLabel: null,
    ...overrides,
  };
}

/** Creates an episode with one YouTube distribution published 2026-10-01 10:00 Asia/Jakarta. */
export function seedDistribution(
  db: DatabaseSync,
  dist: Partial<DistributionInput> = {},
): { episodeId: string; distributionId: string } {
  const episodeId = createEpisode(db, episodeInput());
  const distributionId = createDistribution(db, episodeId, distributionInput(dist), TZ, new Date('2026-12-31T00:00:00Z'));
  return { episodeId, distributionId };
}

export const NOW = new Date('2026-10-23T12:00:00Z');
