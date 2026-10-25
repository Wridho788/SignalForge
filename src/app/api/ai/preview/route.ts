import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { parseAiRequest } from '@/lib/http/ai-request';
import { previewAnalysis } from '@/lib/services/ai';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/** Builds the minimized payload and returns what WOULD be sent. Nothing leaves the machine here. */
export async function POST(request: Request) {
  const parsed = await parseAiRequest(request);
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status, headers: NO_STORE });
  const preview = previewAnalysis(getDb(), parsed.input);
  if ('empty' in preview) return NextResponse.json({ ok: false, message: preview.empty }, { status: 422, headers: NO_STORE });
  return NextResponse.json({ ok: true, ...preview }, { headers: NO_STORE });
}
