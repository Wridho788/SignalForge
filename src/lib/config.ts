import 'server-only';
import path from 'node:path';

/**
 * Local data directory (database, backups). Resolved from SIGNALFORGE_DATA_DIR relative to the
 * working directory. Must not live under a public/static path.
 */
export function resolveDataDir(
  raw: string | undefined = process.env.SIGNALFORGE_DATA_DIR,
  cwd: string = process.cwd(),
): string {
  const resolved = path.resolve(cwd, raw?.trim() || './.data');
  const publicDir = path.resolve(cwd, 'public');
  const rel = path.relative(publicDir, resolved);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error('SIGNALFORGE_DATA_DIR must not be inside the public/ directory.');
  }
  return resolved;
}

export const DATABASE_FILE_NAME = 'signalforge.sqlite';
