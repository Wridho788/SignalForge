import 'server-only';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { PlatformId } from '../domain/types';
import type { Decision, ExperimentDesign, ExperimentStatus, LinkRole, SuccessType } from '../experiments/model';
import { all, get, newId, nowIso, run } from '../db/query';

export interface ExperimentRow {
  id: string;
  title: string;
  hypothesis: string;
  rationale: string | null;
  variableToTest: string;
  targetAudience: string | null;
  design: ExperimentDesign;
  primaryMetricId: string;
  windowHours: number;
  toleranceHours: number;
  successType: SuccessType;
  successValue: number;
  status: ExperimentStatus;
  startedAt: string | null;
  endedAt: string | null;
  decision: Decision | null;
  learning: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentDefinitionFields {
  title: string;
  hypothesis: string;
  rationale: string | null;
  variableToTest: string;
  targetAudience: string | null;
  design: ExperimentDesign;
  primaryMetricId: string;
  windowHours: number;
  toleranceHours: number;
  successType: SuccessType;
  successValue: number;
}

export interface ExperimentListItem extends ExperimentRow {
  primaryMetricLabel: string;
  baselineCount: number;
  variantCount: number;
  supportingCount: number;
}

export interface ExperimentLinkRow {
  distributionId: string;
  role: LinkRole;
  episodeId: string;
  episodeTitle: string;
  platformId: PlatformId;
  platformName: string;
  variantLabel: string | null;
  publishedAt: string | null;
}

export interface LinkableDistribution {
  distributionId: string;
  episodeTitle: string;
  platformId: PlatformId;
  platformName: string;
  variantLabel: string | null;
  publishedAt: string | null;
}

export interface ExperimentEventRow {
  id: string;
  kind: 'created' | 'edited' | 'status' | 'link' | 'unlink' | 'outcome' | 'note';
  fromStatus: ExperimentStatus | null;
  toStatus: ExperimentStatus | null;
  note: string | null;
  createdAt: string;
}

const COLUMNS = `
  x.id AS id, x.title AS title, x.hypothesis AS hypothesis, x.rationale AS rationale,
  x.variable_to_test AS variableToTest, x.target_audience AS targetAudience, x.design AS design,
  x.primary_metric_definition_id AS primaryMetricId, x.comparison_window_hours AS windowHours,
  x.comparison_tolerance_hours AS toleranceHours, x.success_type AS successType, x.success_value AS successValue,
  x.status AS status, x.started_at AS startedAt, x.ended_at AS endedAt, x.decision AS decision,
  x.learning AS learning, x.created_at AS createdAt, x.updated_at AS updatedAt`;

const toRow = (r: ExperimentRow): ExperimentRow => ({
  ...r,
  windowHours: Number(r.windowHours),
  toleranceHours: Number(r.toleranceHours),
  successValue: Number(r.successValue),
});

export function insertExperiment(db: DatabaseSync, f: ExperimentDefinitionFields): string {
  const id = newId();
  const now = nowIso();
  run(
    db,
    `INSERT INTO experiments (id, title, hypothesis, rationale, variable_to_test, target_audience, design,
       primary_metric_definition_id, comparison_window_hours, comparison_tolerance_hours, success_type,
       success_value, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`,
    [id, f.title, f.hypothesis, f.rationale, f.variableToTest, f.targetAudience, f.design, f.primaryMetricId, f.windowHours, f.toleranceHours, f.successType, f.successValue, now, now],
  );
  return id;
}

export function updateExperimentDefinition(db: DatabaseSync, id: string, f: ExperimentDefinitionFields): boolean {
  return (
    run(
      db,
      `UPDATE experiments SET title = ?, hypothesis = ?, rationale = ?, variable_to_test = ?, target_audience = ?,
         design = ?, primary_metric_definition_id = ?, comparison_window_hours = ?, comparison_tolerance_hours = ?,
         success_type = ?, success_value = ?, updated_at = ? WHERE id = ?`,
      [f.title, f.hypothesis, f.rationale, f.variableToTest, f.targetAudience, f.design, f.primaryMetricId, f.windowHours, f.toleranceHours, f.successType, f.successValue, nowIso(), id],
    ) > 0
  );
}

export interface StatusPatch {
  status: ExperimentStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  decision?: Decision | null;
  learning?: string | null;
}

/** Applies a status change; fields not present in the patch keep their value. */
export function applyStatus(db: DatabaseSync, id: string, p: StatusPatch): boolean {
  const sets = ['status = ?', 'updated_at = ?'];
  const params: SQLInputValue[] = [p.status, nowIso()];
  if (p.startedAt !== undefined) {
    sets.push('started_at = ?');
    params.push(p.startedAt);
  }
  if (p.endedAt !== undefined) {
    sets.push('ended_at = ?');
    params.push(p.endedAt);
  }
  if (p.decision !== undefined) {
    sets.push('decision = ?');
    params.push(p.decision);
  }
  if (p.learning !== undefined) {
    sets.push('learning = ?');
    params.push(p.learning);
  }
  return run(db, `UPDATE experiments SET ${sets.join(', ')} WHERE id = ?`, [...params, id]) > 0;
}

export function touchExperiment(db: DatabaseSync, id: string): void {
  run(db, 'UPDATE experiments SET updated_at = ? WHERE id = ?', [nowIso(), id]);
}

export function getExperimentRow(db: DatabaseSync, id: string): ExperimentRow | undefined {
  const r = get<ExperimentRow>(db, `SELECT ${COLUMNS} FROM experiments x WHERE x.id = ?`, [id]);
  return r ? toRow(r) : undefined;
}

export function listExperimentRows(db: DatabaseSync, status: ExperimentStatus | null = null): ExperimentListItem[] {
  return all<ExperimentListItem>(
    db,
    `SELECT ${COLUMNS}, m.label AS primaryMetricLabel,
       (SELECT COUNT(*) FROM experiment_distributions l WHERE l.experiment_id = x.id AND l.role = 'baseline') AS baselineCount,
       (SELECT COUNT(*) FROM experiment_distributions l WHERE l.experiment_id = x.id AND l.role = 'variant') AS variantCount,
       (SELECT COUNT(*) FROM experiment_distributions l WHERE l.experiment_id = x.id AND l.role = 'supporting') AS supportingCount
     FROM experiments x JOIN metric_definitions m ON m.id = x.primary_metric_definition_id
     WHERE (? IS NULL OR x.status = ?)
     ORDER BY x.updated_at DESC, x.title`,
    [status, status],
  ).map((r) => ({ ...toRow(r), primaryMetricLabel: r.primaryMetricLabel, baselineCount: Number(r.baselineCount), variantCount: Number(r.variantCount), supportingCount: Number(r.supportingCount) }));
}

export function deleteExperimentRow(db: DatabaseSync, id: string): boolean {
  return run(db, 'DELETE FROM experiments WHERE id = ?', [id]) > 0;
}

// --- secondary metrics ---

export function replaceSecondaryMetrics(db: DatabaseSync, id: string, metricIds: string[]): void {
  run(db, 'DELETE FROM experiment_secondary_metrics WHERE experiment_id = ?', [id]);
  for (const m of metricIds) {
    run(db, 'INSERT INTO experiment_secondary_metrics (experiment_id, metric_definition_id) VALUES (?, ?)', [id, m]);
  }
}

export function listSecondaryMetricIds(db: DatabaseSync, id: string): string[] {
  return all<{ id: string }>(db, 'SELECT metric_definition_id AS id FROM experiment_secondary_metrics WHERE experiment_id = ? ORDER BY metric_definition_id', [id]).map((r) => r.id);
}

// --- links ---

const LINK_SELECT = `
  l.distribution_id AS distributionId, l.role AS role, d.episode_id AS episodeId, e.title AS episodeTitle,
  d.platform_id AS platformId, p.name AS platformName, d.variant_label AS variantLabel, d.published_at AS publishedAt`;

export function upsertLink(db: DatabaseSync, experimentId: string, distributionId: string, role: LinkRole): void {
  run(
    db,
    `INSERT INTO experiment_distributions (experiment_id, distribution_id, role, created_at) VALUES (?,?,?,?)
     ON CONFLICT(experiment_id, distribution_id) DO UPDATE SET role = excluded.role`,
    [experimentId, distributionId, role, nowIso()],
  );
}

export function deleteLink(db: DatabaseSync, experimentId: string, distributionId: string): boolean {
  return run(db, 'DELETE FROM experiment_distributions WHERE experiment_id = ? AND distribution_id = ?', [experimentId, distributionId]) > 0;
}

export function listLinks(db: DatabaseSync, experimentId: string): ExperimentLinkRow[] {
  return all<ExperimentLinkRow>(
    db,
    `SELECT ${LINK_SELECT}
     FROM experiment_distributions l
     JOIN distributions d ON d.id = l.distribution_id
     JOIN episodes e ON e.id = d.episode_id
     JOIN platforms p ON p.id = d.platform_id
     WHERE l.experiment_id = ?
     ORDER BY CASE l.role WHEN 'baseline' THEN 0 WHEN 'variant' THEN 1 ELSE 2 END, p.name, e.title`,
    [experimentId],
  );
}

export function getLink(db: DatabaseSync, experimentId: string, distributionId: string): ExperimentLinkRow | undefined {
  return get<ExperimentLinkRow>(
    db,
    `SELECT ${LINK_SELECT}
     FROM experiment_distributions l
     JOIN distributions d ON d.id = l.distribution_id
     JOIN episodes e ON e.id = d.episode_id
     JOIN platforms p ON p.id = d.platform_id
     WHERE l.experiment_id = ? AND l.distribution_id = ?`,
    [experimentId, distributionId],
  );
}

export function countLinksByRole(db: DatabaseSync, experimentId: string, role: LinkRole): number {
  return Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM experiment_distributions WHERE experiment_id = ? AND role = ?', [experimentId, role])!.n);
}

/** Distributions that can still be linked (not already linked to this experiment). */
export function listLinkableDistributions(db: DatabaseSync, experimentId: string): LinkableDistribution[] {
  return all<LinkableDistribution>(
    db,
    `SELECT d.id AS distributionId, e.title AS episodeTitle, d.platform_id AS platformId, p.name AS platformName,
       d.variant_label AS variantLabel, d.published_at AS publishedAt
     FROM distributions d JOIN episodes e ON e.id = d.episode_id JOIN platforms p ON p.id = d.platform_id
     WHERE d.id NOT IN (SELECT distribution_id FROM experiment_distributions WHERE experiment_id = ?)
     ORDER BY e.title, p.name, d.variant_label`,
    [experimentId],
  );
}

// --- events (append-only log) ---

export function insertEvent(
  db: DatabaseSync,
  experimentId: string,
  e: { kind: ExperimentEventRow['kind']; fromStatus?: ExperimentStatus | null; toStatus?: ExperimentStatus | null; note?: string | null },
): void {
  run(
    db,
    'INSERT INTO experiment_events (id, experiment_id, kind, from_status, to_status, note, created_at) VALUES (?,?,?,?,?,?,?)',
    [newId(), experimentId, e.kind, e.fromStatus ?? null, e.toStatus ?? null, e.note ?? null, nowIso()],
  );
}

/** Newest first. */
export function listEvents(db: DatabaseSync, experimentId: string): ExperimentEventRow[] {
  return all<ExperimentEventRow>(
    db,
    `SELECT id, kind, from_status AS fromStatus, to_status AS toStatus, note, created_at AS createdAt
     FROM experiment_events WHERE experiment_id = ? ORDER BY created_at DESC, rowid DESC`,
    [experimentId],
  );
}
