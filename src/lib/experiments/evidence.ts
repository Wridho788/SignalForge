import type { EquivalentResult } from '../analytics/equivalent-age';
import { summarize } from '../analytics/stats';
import type { PlatformId } from '../domain/types';
import type { ExperimentDesign, LinkRole, SuccessType } from './model';

export interface LinkedReading {
  distributionId: string;
  platformId: PlatformId;
  role: LinkRole;
  publishedAt: string | null;
  result: EquivalentResult;
}

export type Verdict = 'meets' | 'does_not_meet' | 'insufficient';

export type InsufficientReason =
  | 'no_baseline'
  | 'no_variant'
  | 'no_variant_value'
  | 'no_baseline_value'
  | 'baseline_zero'
  | 'baseline_negative';

export const INSUFFICIENT_LABELS: Record<InsufficientReason, string> = {
  no_baseline: 'Belum ada baseline yang ditautkan',
  no_variant: 'Belum ada varian yang ditautkan',
  no_variant_value: 'Belum ada varian dengan nilai sebanding pada usia target',
  no_baseline_value: 'Belum ada baseline dengan nilai sebanding pada usia target',
  baseline_zero: 'Baseline bernilai 0, kenaikan relatif tidak terdefinisi',
  baseline_negative: 'Baseline negatif, kenaikan relatif ambigu',
};

export interface PlatformEvidence {
  platformId: PlatformId;
  baseline: { linked: number; comparable: number; median: number | null };
  variant: { linked: number; comparable: number; median: number | null };
  /** (variant − baseline) / baseline as a fraction, when defined. */
  relativeGain: number | null;
  verdict: Verdict;
  insufficientReason: InsufficientReason | null;
  warnings: string[];
}

export interface Evidence {
  platforms: PlatformEvidence[];
  /** Limitations that always apply, plus design/sample-specific ones. Shown beside any verdict. */
  limitations: string[];
}

export const MIN_GROUP_SAMPLE = 3;
const CONCURRENT_GAP_DAYS = 7;
const DAY_MS = 86_400_000;

function medianTime(times: (string | null)[]): number | null {
  const ms = times.filter((t): t is string => t !== null).map((t) => Date.parse(t));
  const s = summarize(ms);
  return s.median;
}

/**
 * Compares variant vs baseline strictly WITHIN each platform (platform metrics are not comparable).
 * The result is an observation against a pre-declared threshold, never a causal finding: there is no
 * randomization, so every verdict ships with limitations. Unknown values are not counted as 0.
 */
export function evaluateEvidence(
  readings: LinkedReading[],
  success: { type: SuccessType; value: number },
  design: ExperimentDesign,
): Evidence {
  const platformIds = [...new Set(readings.map((r) => r.platformId))].sort();
  const platforms: PlatformEvidence[] = platformIds.map((platformId) => {
    const inPlatform = readings.filter((r) => r.platformId === platformId);
    const baselineAll = inPlatform.filter((r) => r.role === 'baseline');
    const variantAll = inPlatform.filter((r) => r.role === 'variant');
    const values = (rs: LinkedReading[]) => rs.flatMap((r) => (r.result.ok ? [r.result.value] : []));
    const b = summarize(values(baselineAll));
    const v = summarize(values(variantAll));
    const warnings: string[] = [];

    const base: Omit<PlatformEvidence, 'verdict' | 'insufficientReason' | 'relativeGain'> = {
      platformId,
      baseline: { linked: baselineAll.length, comparable: b.n, median: b.median },
      variant: { linked: variantAll.length, comparable: v.n, median: v.median },
      warnings,
    };

    if (b.n > 0 && b.n < MIN_GROUP_SAMPLE) warnings.push(`Baseline hanya ${b.n} post sebanding (< ${MIN_GROUP_SAMPLE}).`);
    if (v.n > 0 && v.n < MIN_GROUP_SAMPLE) warnings.push(`Varian hanya ${v.n} post sebanding (< ${MIN_GROUP_SAMPLE}).`);
    if (variantAll.length > v.n) warnings.push(`${variantAll.length - v.n} varian tidak punya nilai sebanding dan tidak dihitung (bukan 0).`);
    if (baselineAll.length > b.n) warnings.push(`${baselineAll.length - b.n} baseline tidak punya nilai sebanding dan tidak dihitung (bukan 0).`);

    if (design === 'concurrent') {
      const bt = medianTime(baselineAll.map((r) => r.publishedAt));
      const vt = medianTime(variantAll.map((r) => r.publishedAt));
      if (bt !== null && vt !== null && Math.abs(vt - bt) > CONCURRENT_GAP_DAYS * DAY_MS) {
        warnings.push(`Desain "bersamaan", tetapi baseline dan varian terbit berjarak > ${CONCURRENT_GAP_DAYS} hari; perbandingannya lebih mirip sebelum/sesudah.`);
      }
    }

    const insufficient = (reason: InsufficientReason): PlatformEvidence => ({ ...base, relativeGain: null, verdict: 'insufficient', insufficientReason: reason });

    if (variantAll.length === 0) return insufficient('no_variant');
    if (v.n === 0) return insufficient('no_variant_value');

    if (success.type === 'min_value') {
      return { ...base, relativeGain: null, verdict: v.median! >= success.value ? 'meets' : 'does_not_meet', insufficientReason: null };
    }

    // min_relative_gain needs a usable baseline.
    if (baselineAll.length === 0) return insufficient('no_baseline');
    if (b.n === 0) return insufficient('no_baseline_value');
    if (b.median === 0) return insufficient('baseline_zero');
    if (b.median! < 0) return insufficient('baseline_negative');
    const gain = (v.median! - b.median!) / b.median!;
    return { ...base, relativeGain: gain, verdict: gain >= success.value ? 'meets' : 'does_not_meet', insufficientReason: null };
  });

  const limitations = [
    'Ini pengamatan, bukan eksperimen terkontrol: tidak ada randomisasi, jadi hasil hanya indikasi dan bukan bukti sebab-akibat.',
    'Tiap platform dibandingkan sendiri-sendiri; hasil antar platform tidak digabung.',
  ];
  if (design === 'before_after') {
    limitations.push(
      'Desain sebelum/sesudah tidak dapat memisahkan efek variabel dari faktor lain (waktu, topik, musim, perubahan algoritma). Perbedaan yang terlihat tidak boleh dibaca sebagai efek variabel.',
    );
  }
  if (design === 'other') limitations.push('Desain "lainnya": jelaskan logika perbandingan di rasional agar bisa dinilai.');
  if (platforms.some((p) => p.baseline.comparable < MIN_GROUP_SAMPLE || p.variant.comparable < MIN_GROUP_SAMPLE)) {
    limitations.push(`Sampel kecil (< ${MIN_GROUP_SAMPLE} post sebanding per sisi): satu post luar biasa dapat menggeser median.`);
  }
  return { platforms, limitations };
}
