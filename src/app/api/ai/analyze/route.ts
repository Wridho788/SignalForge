import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { parseAiRequest } from '@/lib/http/ai-request';
import { runAnalysis } from '@/lib/services/ai';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * User-triggered analysis. Requires explicit consent and the hash of the payload the user reviewed. The payload is
 * rebuilt on the server (the client never supplies data to send). Aborting the request cancels the provider process.
 */
export async function POST(request: Request) {
  const parsed = await parseAiRequest(request);
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status, headers: NO_STORE });
  if (!parsed.consent || !parsed.payloadHash) {
    return NextResponse.json({ ok: false, message: 'Persetujuan pengiriman data diperlukan.' }, { status: 400, headers: NO_STORE });
  }
  const outcome = await runAnalysis(getDb(), { ...parsed.input, expectedHash: parsed.payloadHash, signal: request.signal });
  const status = outcome.ok ? 200 : outcome.code === 'DATA_CHANGED' ? 409 : outcome.code === 'NO_DATA' ? 422 : outcome.code === 'BUSY' ? 429 : 200;
  return NextResponse.json(outcome, { status, headers: NO_STORE });
}
