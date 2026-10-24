import { getDb } from '@/lib/db/connection';
import { CSV_TYPE, downloadHeaders } from '@/lib/http/download';
import { errorsToCsv, getImportPreview } from '@/lib/services/imports';
import { getAppSettings } from '@/lib/services/settings';

// Row errors for a PREVIEWED import (line, column, message). Messages never contain cell contents.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const db = getDb();
    const { plan } = getImportPreview(db, id, getAppSettings(db).timezone);
    return new Response(`﻿${errorsToCsv(plan.errors)}`, { headers: downloadHeaders(CSV_TYPE, 'signalforge-import-errors.csv') });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
