import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { countDistributions, countDistributionsWithoutPublishedAt } from '../repositories/distributions';
import { countEpisodes, listEpisodeRows, type EpisodeListItem } from '../repositories/episodes';
import { listExperimentRows, type ExperimentListItem } from '../repositories/experiments';
import { countDistributionsWithoutSnapshots, countSnapshots } from '../repositories/snapshots';

export interface OverviewStats {
  episodes: number;
  distributions: number;
  snapshots: number;
  distributionsWithoutSnapshots: number;
  distributionsWithoutPublishedAt: number;
  recentEpisodes: EpisodeListItem[];
  /** Experiments currently running (the Experiment stage of the cycle). */
  runningExperiments: ExperimentListItem[];
  /** Most recent finished experiments with a decision (the Improve stage). */
  recentDecisions: ExperimentListItem[];
}

/** Counts of recorded facts only — no performance figures are derived here (analytics arrive in M4). */
export function getOverviewStats(db: DatabaseSync): OverviewStats {
  return {
    episodes: countEpisodes(db),
    distributions: countDistributions(db),
    snapshots: countSnapshots(db),
    distributionsWithoutSnapshots: countDistributionsWithoutSnapshots(db),
    distributionsWithoutPublishedAt: countDistributionsWithoutPublishedAt(db),
    recentEpisodes: listEpisodeRows(db).slice(0, 5),
    runningExperiments: listExperimentRows(db, 'running'),
    recentDecisions: [...listExperimentRows(db, 'completed'), ...listExperimentRows(db, 'inconclusive')]
      .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))
      .slice(0, 3),
  };
}
