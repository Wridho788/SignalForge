/**
 * Environment passed to provider child processes: an ALLOWLIST (ARCHITECTURE §5), never the whole server env.
 *
 * Deliberately absent: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY, CODEX_ACCESS_TOKEN and
 * anything else key-like. Per Anthropic's docs an ANTHROPIC_API_KEY in the environment makes Claude Code use
 * API billing instead of the subscription, so passing it would silently change what the user pays for.
 * The CLIs find their own stored login through the user's profile directories (we never read those).
 */
const ALLOWED = [
  // process lookup & OS basics
  'PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  // profile/config locations used by the CLIs to find their own login
  'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME',
  // temp + locale
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  // corporate networks
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
] as const;

const SECRET_LIKE = /(api[_-]?key|token|secret|password|passwd|credential|auth)/i;

export function buildChildEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  const wanted = new Set<string>(ALLOWED.map((k) => k.toLowerCase()));
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (!wanted.has(key.toLowerCase())) continue;
    if (SECRET_LIKE.test(key)) continue; // belt and braces: allowlisted names never look like secrets
    env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}
