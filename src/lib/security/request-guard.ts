/**
 * Host/Origin guard for the loopback-only MVP (SECURITY.md → "Local network").
 * Binding to 127.0.0.1 is not sufficient: a malicious web page can still make the browser send
 * requests to http://127.0.0.1 (CSRF) or point a hostile DNS name at it (DNS rebinding).
 *
 *  - Host must be a loopback name, so rebinding hostnames are rejected.
 *  - State-changing methods must carry an Origin that is a loopback name AND equals the Host.
 */

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type GuardResult = { allowed: true } | { allowed: false; reason: 'bad_host' | 'bad_origin' };

function hostnameOf(hostHeader: string): string {
  // Strip the port; keep bracketed IPv6 intact.
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  const colon = hostHeader.lastIndexOf(':');
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon);
}

export function isLoopbackHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  return LOOPBACK_HOSTNAMES.has(hostnameOf(hostHeader.toLowerCase()));
}

export function checkRequest(input: {
  method: string;
  host: string | null | undefined;
  origin: string | null | undefined;
}): GuardResult {
  if (!isLoopbackHost(input.host)) return { allowed: false, reason: 'bad_host' };
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { allowed: true };

  if (!input.origin) return { allowed: false, reason: 'bad_origin' };
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    return { allowed: false, reason: 'bad_origin' };
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return { allowed: false, reason: 'bad_origin' };
  if (!isLoopbackHost(origin.host)) return { allowed: false, reason: 'bad_origin' };
  if (origin.host.toLowerCase() !== input.host!.toLowerCase()) return { allowed: false, reason: 'bad_origin' };
  return { allowed: true };
}
