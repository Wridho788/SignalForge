import fs from 'node:fs';

/**
 * Removes a temp directory without ever throwing. On Windows a directory that is a running process's working
 * directory is locked (EBUSY) until that process has fully exited, so retry briefly; a leftover empty temp dir
 * is harmless and must never turn a successful analysis into an error.
 */
export async function removeDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  } catch {
    // best effort
  }
}
