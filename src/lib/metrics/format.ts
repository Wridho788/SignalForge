import type { AggregationKind, ValueState } from '../domain/types';

export interface DisplayMetric {
  aggregationKind: AggregationKind;
  currencyCode: string | null;
  unit: string;
}

export interface DisplayValue {
  valueState: ValueState;
  numericValue: number | null;
  textValue: string | null;
}

export interface FormattedMetric {
  /** Text shown in the cell. */
  text: string;
  /** Plain-language description of the state for assistive tech / tooltips. */
  description: string;
  /** True only for a measured value (including a measured zero). */
  known: boolean;
}

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });

/**
 * Renders one stored value. Unknown/missing is never shown as 0 (DESIGN_SYSTEM: KPI rule);
 * a known zero is shown as "0".
 */
export function formatMetricValue(metric: DisplayMetric, value: DisplayValue | undefined): FormattedMetric {
  if (!value || value.valueState === 'unknown') {
    return { text: '—', description: 'Data belum tersedia (tidak diketahui)', known: false };
  }
  if (value.valueState === 'not_available') {
    return { text: 'N/A', description: 'Tidak tersedia di platform', known: false };
  }
  if (value.valueState === 'not_applicable') {
    return { text: 'Tidak berlaku', description: 'Metrik tidak berlaku untuk post ini', known: false };
  }

  if (metric.aggregationKind === 'categorical') {
    return { text: value.textValue ?? '—', description: `Nilai kategori: ${value.textValue ?? ''}`, known: true };
  }
  const n = value.numericValue;
  if (n === null) return { text: '—', description: 'Data belum tersedia (tidak diketahui)', known: false };

  switch (metric.aggregationKind) {
    case 'ratio': {
      const pct = `${number.format(Number((n * 100).toFixed(4)))}%`;
      return { text: pct, description: `${pct} (rasio ${n})`, known: true };
    }
    case 'currency': {
      const text = new Intl.NumberFormat('id-ID', { style: 'currency', currency: metric.currencyCode ?? 'USD' }).format(n);
      return { text, description: text, known: true };
    }
    case 'duration': {
      const text = `${number.format(n)} detik`;
      return { text, description: text, known: true };
    }
    default: {
      const text = number.format(n);
      return { text, description: `${text} ${metric.unit}`, known: true };
    }
  }
}
