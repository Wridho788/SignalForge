export const EXPERIMENT_STATUSES = ['draft', 'planned', 'running', 'completed', 'inconclusive', 'cancelled'] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: 'Draf',
  planned: 'Direncanakan',
  running: 'Berjalan',
  completed: 'Selesai',
  inconclusive: 'Tidak konklusif',
  cancelled: 'Dibatalkan',
};

export const DESIGNS = ['concurrent', 'before_after', 'other'] as const;
export type ExperimentDesign = (typeof DESIGNS)[number];

export const DESIGN_LABELS: Record<ExperimentDesign, string> = {
  concurrent: 'Bersamaan (baseline dan varian terbit di periode yang sama)',
  before_after: 'Sebelum/sesudah (varian terbit setelah baseline)',
  other: 'Lainnya',
};

export const ROLES = ['baseline', 'variant', 'supporting'] as const;
export type LinkRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<LinkRole, string> = {
  baseline: 'Baseline',
  variant: 'Varian',
  supporting: 'Pendukung',
};

export const DECISIONS = ['keep', 'iterate', 'reject', 'inconclusive'] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABELS: Record<Decision, string> = {
  keep: 'Pertahankan',
  iterate: 'Iterasi',
  reject: 'Tolak',
  inconclusive: 'Tidak konklusif',
};

export const SUCCESS_TYPES = ['min_value', 'min_relative_gain'] as const;
export type SuccessType = (typeof SUCCESS_TYPES)[number];

export const SUCCESS_TYPE_LABELS: Record<SuccessType, string> = {
  min_value: 'Nilai varian minimal (dalam satuan metrik)',
  min_relative_gain: 'Kenaikan relatif varian terhadap baseline minimal (%)',
};

const TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['draft', 'running', 'cancelled'],
  // Finishing a running experiment goes through the outcome form (decision + learning).
  running: ['completed', 'inconclusive', 'cancelled'],
  completed: [],
  inconclusive: [],
  cancelled: [],
};

export function canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ExperimentStatus): readonly ExperimentStatus[] {
  return TRANSITIONS[from];
}

/** The definition (hypothesis, variable, metric, window, success criteria) is fixed once running, to prevent moving the goalposts. */
export function isDefinitionEditable(status: ExperimentStatus): boolean {
  return status === 'draft' || status === 'planned';
}

/** Links can change until the experiment is finished or cancelled. */
export function areLinksEditable(status: ExperimentStatus): boolean {
  return status === 'draft' || status === 'planned' || status === 'running';
}

export function isFinished(status: ExperimentStatus): boolean {
  return status === 'completed' || status === 'inconclusive' || status === 'cancelled';
}

/** A decision of 'inconclusive' yields the 'inconclusive' status; any other decision yields 'completed'. */
export function statusForDecision(decision: Decision): 'completed' | 'inconclusive' {
  return decision === 'inconclusive' ? 'inconclusive' : 'completed';
}
