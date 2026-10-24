import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '@/lib/config';
import { downloadHeaders } from '@/lib/http/download';
import { resolveBackupPath } from '@/lib/services/backup';

// Serves a file from <data dir>/backups by plain file name only; anything else is a 404.
export async function GET(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = resolveBackupPath(path.join(resolveDataDir(), 'backups'), name);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: downloadHeaders('application/vnd.sqlite3', name) });
}
