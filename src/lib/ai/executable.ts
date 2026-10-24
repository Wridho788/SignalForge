import fs from 'node:fs';
import path from 'node:path';
import type { ProviderId } from './types';

export interface ResolvedCommand {
  /** Absolute path of the program to execute (spawned with shell:false). */
  command: string;
  /** Fixed leading arguments (e.g. the launcher script when the program is `node`). */
  prefixArgs: string[];
  source: 'override' | 'path' | 'npm-shim';
}

interface Layout {
  /** Names looked up on PATH. */
  name: string;
  /** Windows: file relative to the npm global bin dir that the .cmd/.ps1 shim wraps. */
  npmRelative: string;
}

const LAYOUT: Record<ProviderId, Layout> = {
  claude: { name: 'claude', npmRelative: path.join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe') },
  codex: { name: 'codex', npmRelative: path.join('node_modules', '@openai', 'codex', 'bin', 'codex.js') },
};

const SCRIPT_EXT = /\.(c|m)?js$/i;
const WINDOWS_SHIM_EXT = /\.(cmd|bat|ps1)$/i;

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const fromFile = (file: string, source: ResolvedCommand['source']): ResolvedCommand =>
  SCRIPT_EXT.test(file) ? { command: process.execPath, prefixArgs: [file], source } : { command: file, prefixArgs: [], source };

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

/**
 * Finds the official CLI WITHOUT a shell (SECURITY: fixed executable, argument arrays, shell:false).
 *  1. SIGNALFORGE_CLAUDE_PATH / SIGNALFORGE_CODEX_PATH — an absolute path chosen by the user for non-standard installs.
 *  2. A real executable on PATH (`claude.exe`, or an executable file on macOS/Linux).
 *  3. Windows npm global installs only expose `.cmd`/`.ps1` shims, which cannot be spawned without a shell; the
 *     known package layout next to the shim is used instead (native claude.exe, or codex.js run by node).
 * Shim files are never parsed or executed.
 */
export function resolveProviderCommand(id: ProviderId, options: ResolveOptions = {}): ResolvedCommand | null {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const { name, npmRelative } = LAYOUT[id];

  const override = env[`SIGNALFORGE_${id.toUpperCase()}_PATH`]?.trim();
  if (override) {
    if (!path.isAbsolute(override) || !isFile(override)) return null;
    if (platform === 'win32' && WINDOWS_SHIM_EXT.test(override)) return null;
    return fromFile(override, 'override');
  }

  const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    const names = platform === 'win32' ? [`${name}.exe`, `${name}.com`] : [name];
    for (const n of names) {
      const candidate = path.join(dir, n);
      if (!isFile(candidate)) continue;
      if (platform !== 'win32') {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
        } catch {
          continue;
        }
      }
      return fromFile(candidate, 'path');
    }
  }

  if (platform === 'win32') {
    for (const dir of dirs) {
      if (!['.cmd', '.ps1', ''].some((ext) => isFile(path.join(dir, `${name}${ext}`)))) continue;
      const target = path.join(dir, npmRelative);
      if (isFile(target)) return fromFile(target, 'npm-shim');
    }
  }
  return null;
}
