import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { PLATFORM_IDS, type PlatformId } from '@/lib/domain/types';
import { CSV_TYPE, downloadHeaders } from '@/lib/http/download';
import { exportFileName, exportSnapshotsCsv } from '@/lib/services/exports';

export function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get('platform');
  const episode = request.nextUrl.searchParams.get('episode');
  // Query values are untrusted: unknown ones are ignored, ids are bound as data and pattern-checked.
  const platformId = platform && (PLATFORM_IDS as readonly string[]).includes(platform) ? (platform as PlatformId) : null;
  const episodeId = episode && /^[A-Za-z0-9-]{1,80}$/.test(episode) ? episode : null;

  const csv = exportSnapshotsCsv(getDb(), { platformId, episodeId });
  return new Response(`﻿${csv}`, { headers: downloadHeaders(CSV_TYPE, exportFileName('signalforge-export')) });
}
