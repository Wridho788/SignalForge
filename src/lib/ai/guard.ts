import { AiError } from './errors';
import type { ProviderId } from './types';

/**
 * Concurrency and rate limits for provider calls (SECURITY: "Rate/concurrency limits for AI requests").
 * One call in flight per provider, and a small rolling budget so a loop or double-click cannot burn through
 * someone's plan allowance. State is in memory only (single local user).
 */
const inFlight = new Set<ProviderId>();
const history = new Map<ProviderId, number[]>();

export const MAX_CALLS_PER_WINDOW = 12;
export const WINDOW_MS = 10 * 60 * 1000;

export function resetGuardForTests(): void {
  inFlight.clear();
  history.clear();
}

export async function withProviderGuard<T>(id: ProviderId, fn: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  if (inFlight.has(id)) throw new AiError('BUSY');
  const t = now();
  const recent = (history.get(id) ?? []).filter((x) => t - x < WINDOW_MS);
  if (recent.length >= MAX_CALLS_PER_WINDOW) throw new AiError('BUSY');
  history.set(id, [...recent, t]);
  inFlight.add(id);
  try {
    return await fn();
  } finally {
    inFlight.delete(id);
  }
}
