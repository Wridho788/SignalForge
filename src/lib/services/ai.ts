import 'server-only';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_OUTPUT_CHARS,
  SECTIONS,
  buildAnalysisPayload,
  buildPrompt,
  validateAnalysisText,
  type AnalysisPayload,
  type ConsentSummary,
  type Section,
} from '../ai/analysis';
import { AiError, isAiError, type AiErrorCode } from '../ai/errors';
import { getProvider } from '../ai/registry';
import { PROVIDER_NAMES, type ProviderId } from '../ai/types';
import { getAnalytics, type AnalyticsQuery, type AnalyticsReport } from './analytics';

export interface AnalysisInput {
  provider: ProviderId;
  query: AnalyticsQuery;
  includeTitles: boolean;
}

export interface AnalysisPreview {
  consent: ConsentSummary;
  /** Identifies the exact payload the user reviewed; the run is refused if the data changed in between. */
  payloadHash: string;
  /** The exact JSON that would be sent (shown on request, so consent is informed). */
  payloadJson: string;
  subset: AnalysisSubset;
}

export interface AnalysisSubset {
  metric: string;
  windowHours: number;
  platform: string;
  dateRange: string;
}

export type AnalysisOutcome =
  | {
      ok: true;
      provider: ProviderId;
      providerName: string;
      model: string | null;
      generatedAt: string;
      durationMs: number;
      sections: Record<Section, string>;
      unknownRefs: string[];
      legend: { alias: string; label: string }[];
      subset: AnalysisSubset;
      operationId: string;
    }
  | { ok: false; code: AiErrorCode | 'NO_DATA' | 'DATA_CHANGED'; message: string; remediation: string; operationId: string };

const hashOf = (json: string) => createHash('sha256').update(json).digest('hex').slice(0, 16);

function build(db: DatabaseSync, input: AnalysisInput): { report: AnalyticsReport; payload: AnalysisPayload } | { empty: string } {
  const report = getAnalytics(db, input.query);
  if (!report.metric) return { empty: 'Belum ada definisi metrik numerik untuk dianalisis.' };
  if (report.rows.length === 0) return { empty: 'Tidak ada distribusi yang cocok dengan filter.' };
  if (report.quality.comparable === 0) {
    return { empty: 'Belum ada post yang sebanding pada usia target, jadi tidak ada yang layak dikirim. Tambahkan snapshot atau ubah usia target.' };
  }
  return { report, payload: buildAnalysisPayload(report, { includeTitles: input.includeTitles }) };
}

const subsetOf = (report: AnalyticsReport, payload: AnalysisPayload): AnalysisSubset => ({
  metric: `${report.metric!.label} (${report.metric!.unit})`,
  windowHours: report.window.hours,
  platform: report.query.platformId ?? 'semua platform (terpisah)',
  dateRange: payload.consent.dateRange,
});

export function previewAnalysis(db: DatabaseSync, input: AnalysisInput): AnalysisPreview | { empty: string } {
  const built = build(db, input);
  if ('empty' in built) return built;
  return {
    consent: { provider: PROVIDER_NAMES[input.provider], ...built.payload.consent },
    payloadHash: hashOf(built.payload.json),
    payloadJson: built.payload.json,
    subset: subsetOf(built.report, built.payload),
  };
}

export async function runAnalysis(
  db: DatabaseSync,
  input: AnalysisInput & { expectedHash: string; signal?: AbortSignal },
): Promise<AnalysisOutcome> {
  const operationId = crypto.randomUUID().slice(0, 8);
  const built = build(db, input);
  if ('empty' in built) return { ok: false, code: 'NO_DATA', message: built.empty, remediation: 'Ubah filter atau catat data terlebih dahulu.', operationId };
  if (hashOf(built.payload.json) !== input.expectedHash) {
    return {
      ok: false,
      code: 'DATA_CHANGED',
      message: 'Data berubah sejak Anda meninjau ringkasan pengiriman.',
      remediation: 'Tinjau ulang data yang akan dikirim, lalu lanjutkan.',
      operationId,
    };
  }
  try {
    const result = await getProvider(input.provider).analyze({ prompt: buildPrompt(built.payload), maxOutputChars: MAX_OUTPUT_CHARS }, { signal: input.signal });
    const validated = validateAnalysisText(result.text, new Set(built.payload.refs.keys()));
    const cited = new Set([...validated.text.matchAll(/\b([ES]\d{1,4})\b/g)].map((m) => m[1]!));
    const legend = [...built.payload.refs]
      .filter(([alias]) => cited.has(alias))
      .map(([alias, ref]) => ({ alias, label: ref.kind === 'episode' ? ref.title : `snapshot dari “${ref.title}”` }));
    return {
      ok: true,
      provider: input.provider,
      providerName: PROVIDER_NAMES[input.provider],
      model: result.model,
      generatedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      sections: validated.sections,
      unknownRefs: validated.unknownRefs,
      legend,
      subset: subsetOf(built.report, built.payload),
      operationId,
    };
  } catch (error) {
    const e = isAiError(error) ? error : new AiError('PROVIDER_ERROR');
    // Only the safe code and operation id are logged — never the prompt, the answer, or provider text.
    console.warn(`[ai] ${input.provider} analysis failed: ${e.code} (op ${e.operationId})`);
    return { ok: false, code: e.code, message: e.message, remediation: e.remediation, operationId: e.operationId };
  }
}

export { SECTIONS };
