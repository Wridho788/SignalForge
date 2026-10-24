import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { selectEquivalent, type EquivalentResult, type SnapshotPoint } from '../analytics/equivalent-age';
import { DomainError, NotFoundError } from '../domain/errors';
import { inTransaction } from '../db/tx';
import { evaluateEvidence, type Evidence, type LinkedReading } from '../experiments/evidence';
import {
  DECISION_LABELS,
  EXPERIMENT_STATUS_LABELS,
  ROLE_LABELS,
  areLinksEditable,
  canTransition,
  isDefinitionEditable,
  statusForDecision,
  type ExperimentStatus,
} from '../experiments/model';
import { formatMetricValue } from '../metrics/format';
import { parseMetricInput } from '../metrics/parse';
import { getDistributionRow } from '../repositories/distributions';
import { getEpisodeRow } from '../repositories/episodes';
import { listMetricPointsForDistributions, type MetricPointRow } from '../repositories/analytics';
import {
  applyStatus,
  countLinksByRole,
  deleteExperimentRow,
  deleteLink,
  getExperimentRow,
  getLink,
  insertEvent,
  insertExperiment,
  listEvents,
  listExperimentRows,
  listLinkableDistributions,
  listLinks,
  listSecondaryMetricIds,
  replaceSecondaryMetrics,
  touchExperiment,
  updateExperimentDefinition,
  upsertLink,
  type ExperimentDefinitionFields,
  type ExperimentEventRow,
  type ExperimentLinkRow,
  type ExperimentListItem,
  type ExperimentRow,
  type LinkableDistribution,
} from '../repositories/experiments';
import { getMetricDefinitionRow, type MetricDefinitionRow } from '../repositories/metric-definitions';
import type { ExperimentInput, LinkInput, OutcomeInput } from '../validation/experiment';
import { getAppSettings } from './settings';

const NUMERIC_KINDS = new Set(['counter', 'ratio', 'duration', 'currency']);

const asPoint = (r: MetricPointRow): SnapshotPoint => ({
  snapshotId: r.snapshotId,
  capturedAt: r.capturedAt,
  postAgeSeconds: r.postAgeSeconds === null ? null : Number(r.postAgeSeconds),
  state: r.state,
  numericValue: r.numericValue === null ? null : Number(r.numericValue),
});

function linkLabel(l: Pick<ExperimentLinkRow, 'episodeTitle' | 'platformName' | 'variantLabel'>): string {
  return `${l.episodeTitle} — ${l.platformName}${l.variantLabel ? ` (${l.variantLabel})` : ''}`;
}

function requireExperiment(db: DatabaseSync, id: string): ExperimentRow {
  const e = getExperimentRow(db, id);
  if (!e) throw new NotFoundError('Eksperimen');
  return e;
}

/** Validates form input against live data and turns it into storable fields. */
function resolveDefinition(db: DatabaseSync, input: ExperimentInput): ExperimentDefinitionFields {
  const errors: Record<string, string> = {};
  const settings = getAppSettings(db);

  const metric = getMetricDefinitionRow(db, input.primaryMetricId);
  if (!metric || !metric.isActive || !NUMERIC_KINDS.has(metric.aggregationKind)) {
    errors.primaryMetricId = 'Pilih metrik numerik yang aktif.';
  }

  const window = settings.comparisonWindows.find((w) => w.hours === input.windowHours);
  if (!window) errors.windowHours = 'Pilih salah satu jendela usia yang dikonfigurasi di Pengaturan.';

  let successValue = 0;
  if (metric && !errors.primaryMetricId) {
    if (input.successType === 'min_value') {
      const parsed = parseMetricInput(input.successValue, metric);
      if (!parsed.ok || parsed.numericValue === null) errors.successValue = parsed.ok ? 'Masukkan angka.' : parsed.error;
      else if (parsed.numericValue < 0) errors.successValue = 'Ambang tidak boleh negatif.';
      else successValue = parsed.numericValue;
    } else if (!/^\d{1,5}([.,]\d{1,4})?$/.test(input.successValue)) {
      errors.successValue = 'Masukkan persentase kenaikan (mis. 20 atau 12,5).';
    } else {
      const pct = Number(input.successValue.replace(',', '.'));
      if (pct > 10000) errors.successValue = 'Maksimal 10000%.';
      else successValue = Number((pct / 100).toFixed(8));
    }
  }

  for (const id of input.secondaryMetricIds) {
    const m = getMetricDefinitionRow(db, id);
    if (!m || !m.isActive || !NUMERIC_KINDS.has(m.aggregationKind) || id === input.primaryMetricId) {
      errors.secondaryMetricIds = 'Metrik sekunder harus numerik, aktif, dan berbeda dari metrik utama.';
      break;
    }
  }

  if (Object.keys(errors).length > 0) throw new DomainError('Periksa kembali isian yang ditandai.', errors);
  return {
    title: input.title,
    hypothesis: input.hypothesis,
    rationale: input.rationale,
    variableToTest: input.variableToTest,
    targetAudience: input.targetAudience,
    design: input.design,
    primaryMetricId: input.primaryMetricId,
    windowHours: window!.hours,
    toleranceHours: window!.toleranceHours,
    successType: input.successType,
    successValue,
  };
}

export function createExperiment(db: DatabaseSync, input: ExperimentInput): string {
  const fields = resolveDefinition(db, input);
  return inTransaction(db, () => {
    const id = insertExperiment(db, fields);
    replaceSecondaryMetrics(db, id, input.secondaryMetricIds);
    insertEvent(db, id, { kind: 'created', toStatus: 'draft', note: 'Eksperimen dibuat.' });
    return id;
  });
}

export function updateExperiment(db: DatabaseSync, id: string, input: ExperimentInput): void {
  const fields = resolveDefinition(db, input);
  inTransaction(db, () => {
    const current = requireExperiment(db, id);
    if (!isDefinitionEditable(current.status)) {
      throw new DomainError(
        `Definisi tidak bisa diubah saat status ${EXPERIMENT_STATUS_LABELS[current.status]}. Hipotesis dan kriteria sukses dikunci setelah eksperimen berjalan agar ambang tidak digeser setelah melihat data.`,
      );
    }
    // Links to a platform-specific metric must stay on that platform.
    const metric = getMetricDefinitionRow(db, fields.primaryMetricId)!;
    if (metric.platformId && listLinks(db, id).some((l) => l.platformId !== metric.platformId)) {
      throw new DomainError('Ada distribusi tertaut dari platform lain; lepaskan dulu sebelum memakai metrik khusus platform.', { primaryMetricId: 'Tidak cocok dengan platform distribusi tertaut.' });
    }
    updateExperimentDefinition(db, id, fields);
    replaceSecondaryMetrics(db, id, input.secondaryMetricIds);
    insertEvent(db, id, { kind: 'edited', note: 'Definisi diperbarui.' });
  });
}

export function listExperiments(db: DatabaseSync, status: ExperimentStatus | null = null): ExperimentListItem[] {
  return listExperimentRows(db, status);
}

export interface ExperimentDetail {
  experiment: ExperimentRow;
  metric: MetricDefinitionRow;
  secondaryMetrics: MetricDefinitionRow[];
  links: ExperimentLinkRow[];
  linkable: LinkableDistribution[];
  events: ExperimentEventRow[];
}

export function getExperimentDetail(db: DatabaseSync, id: string): ExperimentDetail {
  const experiment = requireExperiment(db, id);
  const metric = getMetricDefinitionRow(db, experiment.primaryMetricId)!;
  const secondaryMetrics = listSecondaryMetricIds(db, id).flatMap((m) => {
    const row = getMetricDefinitionRow(db, m);
    return row ? [row] : [];
  });
  return {
    experiment,
    metric,
    secondaryMetrics,
    links: listLinks(db, id),
    linkable: areLinksEditable(experiment.status)
      ? listLinkableDistributions(db, id).filter((d) => !metric.platformId || d.platformId === metric.platformId)
      : [],
    events: listEvents(db, id),
  };
}

/** Moves the experiment along planned → running → (outcome form) or to cancelled. Outcomes use `recordOutcome`. */
export function transitionExperiment(db: DatabaseSync, id: string, to: ExperimentStatus, now: Date = new Date()): void {
  inTransaction(db, () => {
    const current = requireExperiment(db, id);
    if (to === 'completed' || to === 'inconclusive') {
      throw new DomainError('Catat hasil lewat form hasil (keputusan dan pembelajaran wajib diisi).');
    }
    if (!canTransition(current.status, to)) {
      throw new DomainError(`Tidak bisa berpindah dari ${EXPERIMENT_STATUS_LABELS[current.status]} ke ${EXPERIMENT_STATUS_LABELS[to]}.`);
    }
    if (to === 'running') {
      const baselines = countLinksByRole(db, id, 'baseline');
      const variants = countLinksByRole(db, id, 'variant');
      if (baselines < 1 || variants < 1) {
        throw new DomainError('Untuk memulai, tautkan minimal satu distribusi baseline dan satu distribusi varian.');
      }
    }
    applyStatus(db, id, {
      status: to,
      startedAt: to === 'running' ? now.toISOString() : undefined,
      endedAt: to === 'cancelled' ? now.toISOString() : undefined,
    });
    insertEvent(db, id, { kind: 'status', fromStatus: current.status, toStatus: to });
  });
}

/** Records the decision and learning. A decision of "inconclusive" is a valid, first-class outcome. */
export function recordOutcome(db: DatabaseSync, id: string, input: OutcomeInput, now: Date = new Date()): void {
  inTransaction(db, () => {
    const current = requireExperiment(db, id);
    if (current.status !== 'running') {
      throw new DomainError('Hasil hanya bisa dicatat untuk eksperimen yang sedang berjalan.');
    }
    const status = statusForDecision(input.decision);
    applyStatus(db, id, { status, decision: input.decision, learning: input.learning, endedAt: now.toISOString() });
    insertEvent(db, id, { kind: 'status', fromStatus: current.status, toStatus: status });
    insertEvent(db, id, { kind: 'outcome', toStatus: status, note: `Keputusan: ${DECISION_LABELS[input.decision]}. ${input.learning}` });
  });
}

export function linkDistribution(db: DatabaseSync, id: string, input: LinkInput): void {
  inTransaction(db, () => {
    const exp = requireExperiment(db, id);
    if (!areLinksEditable(exp.status)) {
      throw new DomainError(`Tautan tidak bisa diubah saat status ${EXPERIMENT_STATUS_LABELS[exp.status]}.`);
    }
    const dist = getDistributionRow(db, input.distributionId);
    if (!dist) throw new DomainError('Distribusi tidak ditemukan.', { distributionId: 'Distribusi tidak ditemukan.' });
    const metric = getMetricDefinitionRow(db, exp.primaryMetricId)!;
    if (metric.platformId && dist.platformId !== metric.platformId) {
      throw new DomainError(`Metrik utama khusus ${metric.platformName}; hanya distribusi ${metric.platformName} yang bisa ditautkan.`, { distributionId: 'Platform tidak cocok dengan metrik utama.' });
    }
    upsertLink(db, id, dist.id, input.role);
    touchExperiment(db, id);
    const episode = getEpisodeRow(db, dist.episodeId);
    insertEvent(db, id, {
      kind: 'link',
      note: `${ROLE_LABELS[input.role]}: ${linkLabel({ episodeTitle: episode?.title ?? 'Episode', platformName: dist.platformName, variantLabel: dist.variantLabel })}`,
    });
  });
}

export function unlinkDistribution(db: DatabaseSync, id: string, distributionId: string): void {
  inTransaction(db, () => {
    const exp = requireExperiment(db, id);
    if (!areLinksEditable(exp.status)) {
      throw new DomainError(`Tautan tidak bisa diubah saat status ${EXPERIMENT_STATUS_LABELS[exp.status]}.`);
    }
    const link = getLink(db, id, distributionId);
    if (!link || !deleteLink(db, id, distributionId)) throw new NotFoundError('Tautan');
    touchExperiment(db, id);
    insertEvent(db, id, { kind: 'unlink', note: `${ROLE_LABELS[link.role]} dilepas: ${linkLabel(link)}` });
  });
}

export function addNote(db: DatabaseSync, id: string, note: string): void {
  inTransaction(db, () => {
    requireExperiment(db, id);
    insertEvent(db, id, { kind: 'note', note });
    touchExperiment(db, id);
  });
}

/** Only drafts and cancelled experiments can be deleted; anything that ran stays as a record. */
export function deleteExperiment(db: DatabaseSync, id: string): void {
  inTransaction(db, () => {
    const exp = requireExperiment(db, id);
    if (exp.status !== 'draft' && exp.status !== 'cancelled') {
      throw new DomainError('Hanya eksperimen Draf atau Dibatalkan yang bisa dihapus; eksperimen yang pernah berjalan disimpan sebagai catatan keputusan.');
    }
    deleteExperimentRow(db, id);
  });
}

// --- evidence (computed on read; stores nothing, claims nothing causal) ---

export interface LinkWithReadings extends ExperimentLinkRow {
  primary: EquivalentResult;
  secondary: { metric: MetricDefinitionRow; result: EquivalentResult }[];
}

export interface ExperimentEvidence {
  detail: ExperimentDetail;
  links: LinkWithReadings[];
  evidence: Evidence;
  /** Human-readable pre-declared success criterion. */
  successDescription: string;
}

export function describeSuccess(e: Pick<ExperimentRow, 'successType' | 'successValue' | 'windowHours' | 'toleranceHours'>, metric: MetricDefinitionRow): string {
  const window = `usia ${e.windowHours} jam ± ${e.toleranceHours} jam`;
  if (e.successType === 'min_value') {
    const v = formatMetricValue(metric, { valueState: 'known', numericValue: e.successValue, textValue: null }).text;
    return `Median ${metric.label} varian ≥ ${v} (${metric.unit}) pada ${window}.`;
  }
  const pct = Number((e.successValue * 100).toFixed(4)).toString().replace('.', ',');
  return `Median ${metric.label} varian minimal ${pct}% lebih tinggi daripada median baseline pada ${window}, dalam platform yang sama.`;
}

export function getExperimentEvidence(db: DatabaseSync, id: string): ExperimentEvidence {
  const detail = getExperimentDetail(db, id);
  const { experiment: e, metric, secondaryMetrics, links } = detail;
  const ids = links.map((l) => l.distributionId);

  const read = (metricId: string): Map<string, EquivalentResult> => {
    const byDist = new Map<string, SnapshotPoint[]>();
    for (const p of listMetricPointsForDistributions(db, ids, metricId)) {
      if (!byDist.has(p.distributionId)) byDist.set(p.distributionId, []);
      byDist.get(p.distributionId)!.push(asPoint(p));
    }
    return new Map(ids.map((d) => [d, selectEquivalent(byDist.get(d) ?? [], e.windowHours, e.toleranceHours)]));
  };

  const primary = read(metric.id);
  const secondary = secondaryMetrics.map((m) => ({ metric: m, results: read(m.id) }));
  const withReadings: LinkWithReadings[] = links.map((l) => ({
    ...l,
    primary: primary.get(l.distributionId)!,
    secondary: secondary.map((s) => ({ metric: s.metric, result: s.results.get(l.distributionId)! })),
  }));

  const readings: LinkedReading[] = withReadings
    .filter((l) => l.role === 'baseline' || l.role === 'variant')
    .map((l) => ({ distributionId: l.distributionId, platformId: l.platformId, role: l.role, publishedAt: l.publishedAt, result: l.primary }));

  return {
    detail,
    links: withReadings,
    evidence: evaluateEvidence(readings, { type: e.successType, value: e.successValue }, e.design),
    successDescription: describeSuccess(e, metric),
  };
}
