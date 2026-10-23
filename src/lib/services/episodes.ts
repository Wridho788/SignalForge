import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, NotFoundError } from '../domain/errors';
import { inTransaction } from '../db/tx';
import { isUniqueViolation } from '../db/query';
import { listDistributionsForEpisode, type DistributionListItem } from '../repositories/distributions';
import {
  deleteEpisodeRow,
  deleteOrphanTags,
  findEpisodeIdByCode,
  getEpisodeRow,
  getEpisodeTagNames,
  insertEpisode,
  listEpisodeRows,
  listTagUsage,
  replaceEpisodeTags,
  updateEpisodeRow,
  type EpisodeFilter,
  type EpisodeListItem,
  type EpisodeRow,
  type EpisodeWriteFields,
  type TagUsage,
} from '../repositories/episodes';
import { countSnapshotsForEpisode } from '../repositories/snapshots';
import type { EpisodeInput } from '../validation/episode';

const CODE_TAKEN = 'Kode episode sudah dipakai episode lain.';

function toWriteFields(input: EpisodeInput): EpisodeWriteFields {
  return {
    episodeCode: input.episodeCode,
    title: input.title,
    workingTitle: input.workingTitle,
    premise: input.premise,
    format: input.format,
    durationSeconds: input.durationSeconds,
    scriptText: input.scriptText,
    notes: input.notes,
  };
}

function assertCodeFree(db: DatabaseSync, code: string | null, selfId?: string): void {
  if (!code) return;
  const owner = findEpisodeIdByCode(db, code);
  if (owner && owner !== selfId) throw new DomainError(CODE_TAKEN, { episodeCode: CODE_TAKEN });
}

export function createEpisode(db: DatabaseSync, input: EpisodeInput): string {
  try {
    return inTransaction(db, () => {
      assertCodeFree(db, input.episodeCode);
      const id = insertEpisode(db, toWriteFields(input));
      replaceEpisodeTags(db, id, input.tags);
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'episodes.episode_code')) {
      throw new DomainError(CODE_TAKEN, { episodeCode: CODE_TAKEN });
    }
    throw error;
  }
}

export function updateEpisode(db: DatabaseSync, id: string, input: EpisodeInput): void {
  try {
    inTransaction(db, () => {
      if (!getEpisodeRow(db, id)) throw new NotFoundError('Episode');
      assertCodeFree(db, input.episodeCode, id);
      updateEpisodeRow(db, id, toWriteFields(input));
      replaceEpisodeTags(db, id, input.tags);
    });
  } catch (error) {
    if (isUniqueViolation(error, 'episodes.episode_code')) {
      throw new DomainError(CODE_TAKEN, { episodeCode: CODE_TAKEN });
    }
    throw error;
  }
}

export interface EpisodeDetail {
  episode: EpisodeRow;
  tags: string[];
  distributions: DistributionListItem[];
}

export function getEpisodeDetail(db: DatabaseSync, id: string): EpisodeDetail {
  const episode = getEpisodeRow(db, id);
  if (!episode) throw new NotFoundError('Episode');
  return {
    episode,
    tags: getEpisodeTagNames(db, id),
    distributions: listDistributionsForEpisode(db, id),
  };
}

export function listEpisodes(db: DatabaseSync, filter: EpisodeFilter = {}): EpisodeListItem[] {
  return listEpisodeRows(db, filter);
}

export function listTags(db: DatabaseSync): TagUsage[] {
  return listTagUsage(db);
}

export interface EpisodeDeletePreview {
  title: string;
  distributionCount: number;
  snapshotCount: number;
}

export function previewEpisodeDelete(db: DatabaseSync, id: string): EpisodeDeletePreview {
  const episode = getEpisodeRow(db, id);
  if (!episode) throw new NotFoundError('Episode');
  return {
    title: episode.title,
    distributionCount: listDistributionsForEpisode(db, id).length,
    snapshotCount: countSnapshotsForEpisode(db, id),
  };
}

/** Deletes the episode and, by cascade, its distributions and their snapshots. Callers must confirm first. */
export function deleteEpisode(db: DatabaseSync, id: string): void {
  inTransaction(db, () => {
    if (!deleteEpisodeRow(db, id)) throw new NotFoundError('Episode');
    deleteOrphanTags(db);
  });
}
