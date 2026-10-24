import { Badge } from '@/components/ui/feedback';
import { EXPERIMENT_STATUS_LABELS, type ExperimentStatus } from '@/lib/experiments/model';
import { INSUFFICIENT_LABELS, type PlatformEvidence } from '@/lib/experiments/evidence';
import type { ExperimentEventRow } from '@/lib/repositories/experiments';

const STATUS_TONE: Record<ExperimentStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  planned: 'info',
  running: 'warning',
  completed: 'success',
  inconclusive: 'neutral',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{EXPERIMENT_STATUS_LABELS[status]}</Badge>;
}

/** Wording never says "proved"/"caused": a pre-declared threshold was or was not reached in the observed data. */
export function VerdictBadge({ evidence }: { evidence: PlatformEvidence }) {
  if (evidence.verdict === 'meets') return <Badge tone="success">Ambang tercapai (indikasi)</Badge>;
  if (evidence.verdict === 'does_not_meet') return <Badge tone="neutral">Ambang belum tercapai</Badge>;
  return (
    <Badge tone="warning">
      Data belum cukup{evidence.insufficientReason ? ` — ${INSUFFICIENT_LABELS[evidence.insufficientReason]}` : ''}
    </Badge>
  );
}

export function eventLabel(e: ExperimentEventRow): string {
  switch (e.kind) {
    case 'created':
      return 'Dibuat';
    case 'edited':
      return 'Definisi diubah';
    case 'status':
      return `Status: ${e.fromStatus ? EXPERIMENT_STATUS_LABELS[e.fromStatus] : '—'} → ${e.toStatus ? EXPERIMENT_STATUS_LABELS[e.toStatus] : '—'}`;
    case 'link':
      return 'Tautan ditambahkan';
    case 'unlink':
      return 'Tautan dilepas';
    case 'outcome':
      return 'Hasil dicatat';
    case 'note':
      return 'Catatan';
  }
}
