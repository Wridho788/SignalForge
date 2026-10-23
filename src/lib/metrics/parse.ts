import type { AggregationKind } from '../domain/types';

export interface MetricShape {
  aggregationKind: AggregationKind;
  allowNegative: boolean;
  currencyCode: string | null;
}

export type ParsedMetricValue =
  | { ok: true; numericValue: number; textValue: null }
  | { ok: true; numericValue: null; textValue: string }
  | { ok: false; error: string };

/** Largest magnitude accepted; keeps values exactly representable and rejects typos like 1e30. */
export const MAX_METRIC_MAGNITUDE = 1e15;

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Parses a NON-BLANK raw form value for a metric. Blank input is "unknown" and never reaches
 * here (it must not be turned into 0). Decimal comma or dot is accepted; thousands separators
 * are rejected because "1.234" is ambiguous between locales.
 *
 * Ratios are entered as a percentage (0–100) and stored as a fraction (0–1).
 */
export function parseMetricInput(raw: string, shape: MetricShape): ParsedMetricValue {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Nilai kosong.' };

  if (shape.aggregationKind === 'categorical') {
    if (text.length > 200) return { ok: false, error: 'Maksimal 200 karakter.' };
    if (/[\u0000-\u001F\u007F]/.test(text)) return { ok: false, error: 'Mengandung karakter yang tidak diizinkan.' };
    return { ok: true, numericValue: null, textValue: text };
  }

  if (shape.aggregationKind === 'counter') {
    if (!INTEGER_RE.test(text)) {
      return { ok: false, error: 'Masukkan bilangan bulat tanpa pemisah ribuan atau desimal.' };
    }
  } else if (!DECIMAL_RE.test(text)) {
    return { ok: false, error: 'Masukkan angka (desimal pakai koma atau titik, tanpa pemisah ribuan).' };
  }

  let value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value) || Math.abs(value) > MAX_METRIC_MAGNITUDE) {
    return { ok: false, error: 'Angka terlalu besar.' };
  }
  if (Object.is(value, -0)) value = 0;
  if (value < 0 && !shape.allowNegative) return { ok: false, error: 'Nilai tidak boleh negatif.' };

  if (shape.aggregationKind === 'ratio') {
    if (value < 0 || value > 100) return { ok: false, error: 'Persentase harus antara 0 dan 100.' };
    value = Number((value / 100).toFixed(10));
  }
  return { ok: true, numericValue: value, textValue: null };
}
