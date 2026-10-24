/** Headers for file downloads: never cached, never sniffed, always an attachment with a safe name. */
export function downloadHeaders(contentType: string, fileName: string): HeadersInit {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${safe}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
}

export const CSV_TYPE = 'text/csv; charset=utf-8';
