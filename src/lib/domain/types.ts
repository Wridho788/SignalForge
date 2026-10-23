export const PLATFORM_IDS = ['facebook', 'youtube', 'tiktok'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export const DISTRIBUTION_STATUSES = ['draft', 'published', 'archived', 'unknown'] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = {
  draft: 'Draf',
  published: 'Terbit',
  archived: 'Diarsipkan',
  unknown: 'Tidak diketahui',
};

export const VALUE_STATES = ['known', 'unknown', 'not_available', 'not_applicable'] as const;
export type ValueState = (typeof VALUE_STATES)[number];

export const VALUE_STATE_LABELS: Record<ValueState, string> = {
  known: 'Diketahui',
  unknown: 'Tidak diketahui',
  not_available: 'Tidak tersedia di platform',
  not_applicable: 'Tidak berlaku',
};

export const AGGREGATION_KINDS = ['counter', 'ratio', 'duration', 'currency', 'categorical'] as const;
export type AggregationKind = (typeof AGGREGATION_KINDS)[number];

export const AGGREGATION_KIND_LABELS: Record<AggregationKind, string> = {
  counter: 'Hitungan (bilangan bulat)',
  ratio: 'Rasio / persentase',
  duration: 'Durasi (detik)',
  currency: 'Mata uang',
  categorical: 'Kategori (teks)',
};
