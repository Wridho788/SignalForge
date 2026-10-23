import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, NotFoundError } from '../domain/errors';
import { inTransaction } from '../db/tx';
import { isUniqueViolation } from '../db/query';
import {
  countSnapshotsForDistribution,
  deleteDistributionRow,
  findDuplicateDistributionId,
  getDistributionRow,
  insertDistribution,
  updateDistributionRow,
  type DistributionRow,
  type DistributionWriteFields,
} from '../repositories/distributions';
import { getEpisodeRow, touchEpisode } from '../repositories/episodes';
import { localInputToUtcIso } from '../time';
import type { DistributionInput } from '../validation/distribution';

const DUPLICATE =
  'Episode ini sudah punya distribusi untuk platform tersebut. Isi label varian jika ini repost/varian.';
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function resolveFields(input: DistributionInput, timezone: string, now: Date): DistributionWriteFields {
  let publishedAt: string | null = null;
  if (input.publishedAtLocal) {
    publishedAt = localInputToUtcIso(input.publishedAtLocal, timezone);
    if (!publishedAt) {
      const message = `Waktu terbit tidak valid di zona waktu ${timezone} (format salah atau waktu tidak ada).`;
      throw new DomainError(message, { publishedAtLocal: message });
    }
    if (input.status === 'published' && Date.parse(publishedAt) > now.getTime() + FUTURE_SKEW_MS) {
      const message = 'Waktu terbit ada di masa depan. Gunakan status Draf untuk post yang belum terbit.';
      throw new DomainError(message, { publishedAtLocal: message });
    }
  }
  return {
    platformId: input.platformId,
    status: input.status,
    postUrl: input.postUrl,
    publishedAt,
    externalPostId: input.externalPostId,
    variantLabel: input.variantLabel,
  };
}

function assertNoDuplicate(
  db: DatabaseSync,
  episodeId: string,
  fields: DistributionWriteFields,
  selfId?: string,
): void {
  if (findDuplicateDistributionId(db, episodeId, fields.platformId, fields.variantLabel, selfId)) {
    throw new DomainError(DUPLICATE, { variantLabel: DUPLICATE });
  }
}

export function createDistribution(
  db: DatabaseSync,
  episodeId: string,
  input: DistributionInput,
  timezone: string,
  now: Date = new Date(),
): string {
  const fields = resolveFields(input, timezone, now);
  try {
    return inTransaction(db, () => {
      if (!getEpisodeRow(db, episodeId)) throw new NotFoundError('Episode');
      assertNoDuplicate(db, episodeId, fields);
      const id = insertDistribution(db, episodeId, fields);
      touchEpisode(db, episodeId);
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'distributions')) throw new DomainError(DUPLICATE, { variantLabel: DUPLICATE });
    throw error;
  }
}

export function updateDistribution(
  db: DatabaseSync,
  id: string,
  input: DistributionInput,
  timezone: string,
  now: Date = new Date(),
): void {
  const fields = resolveFields(input, timezone, now);
  try {
    inTransaction(db, () => {
      const existing = getDistributionRow(db, id);
      if (!existing) throw new NotFoundError('Distribusi');
      if (existing.platformId !== fields.platformId && countSnapshotsForDistribution(db, id) > 0) {
        const message = 'Platform tidak bisa diganti karena distribusi ini sudah punya snapshot.';
        throw new DomainError(message, { platformId: message });
      }
      assertNoDuplicate(db, existing.episodeId, fields, id);
      updateDistributionRow(db, id, fields);
      touchEpisode(db, existing.episodeId);
    });
  } catch (error) {
    if (isUniqueViolation(error, 'distributions')) throw new DomainError(DUPLICATE, { variantLabel: DUPLICATE });
    throw error;
  }
}

export function getDistribution(db: DatabaseSync, id: string): DistributionRow {
  const row = getDistributionRow(db, id);
  if (!row) throw new NotFoundError('Distribusi');
  return row;
}

export interface DistributionDeletePreview {
  episodeId: string;
  label: string;
  snapshotCount: number;
}

export function previewDistributionDelete(db: DatabaseSync, id: string): DistributionDeletePreview {
  const d = getDistribution(db, id);
  return {
    episodeId: d.episodeId,
    label: d.variantLabel ? `${d.platformName} — ${d.variantLabel}` : d.platformName,
    snapshotCount: countSnapshotsForDistribution(db, id),
  };
}

/** Deletes the distribution and, by cascade, its snapshots. Callers must confirm first. */
export function deleteDistribution(db: DatabaseSync, id: string): string {
  return inTransaction(db, () => {
    const d = getDistribution(db, id);
    deleteDistributionRow(db, id);
    touchEpisode(db, d.episodeId);
    return d.episodeId;
  });
}
