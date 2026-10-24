import { CSV_TYPE, downloadHeaders } from '@/lib/http/download';
import { templateCsv } from '@/lib/services/exports';

// Versioned import template (CSV format v1) with clearly marked sample rows.
export function GET() {
  return new Response(`﻿${templateCsv()}`, { headers: downloadHeaders(CSV_TYPE, 'signalforge-template-v1.csv') });
}
