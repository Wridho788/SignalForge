import { z } from 'zod';
import { parseAnalyticsParams } from '@/features/analytics/params';
import { PROVIDER_IDS } from '@/lib/ai/types';
import type { AnalysisInput } from '@/lib/services/ai';

/** Request bodies for /api/ai/* are tiny (filters only); anything larger is refused before parsing. */
export const MAX_BODY_BYTES = 4 * 1024;

const envelope = z.object({
  provider: z.enum(PROVIDER_IDS),
  includeTitles: z.boolean().default(false),
  /** Raw analytics filters exactly as in the URL; validated again by parseAnalyticsParams. */
  filters: z.record(z.string().max(120), z.string().max(120)).default({}),
  consent: z.boolean().optional(),
  payloadHash: z.string().regex(/^[0-9a-f]{16}$/).optional(),
});

export type ParsedAiRequest =
  | { ok: true; input: AnalysisInput; consent: boolean; payloadHash: string | null }
  | { ok: false; status: number; message: string };

export async function parseAiRequest(request: Request): Promise<ParsedAiRequest> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413, message: 'Permintaan terlalu besar.' };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, status: 413, message: 'Permintaan terlalu besar.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, message: 'Isi permintaan bukan JSON yang valid.' };
  }
  const parsed = envelope.safeParse(json);
  if (!parsed.success) return { ok: false, status: 400, message: 'Isi permintaan tidak valid.' };
  const { query, ignored } = parseAnalyticsParams(parsed.data.filters);
  if (ignored.length > 0) return { ok: false, status: 400, message: `Filter tidak valid: ${ignored.join(', ')}.` };
  return {
    ok: true,
    input: { provider: parsed.data.provider, query, includeTitles: parsed.data.includeTitles },
    consent: parsed.data.consent === true,
    payloadHash: parsed.data.payloadHash ?? null,
  };
}
