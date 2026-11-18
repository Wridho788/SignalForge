import 'server-only';
import { resolveDataDir } from '../config';
import { ClaudeProvider } from './claude';
import { CodexProvider } from './codex';
import { GeminiProvider } from './gemini';
import { AiError, isAiError, newOperationId, type AiErrorCode } from './errors';
import { FakeCodexProvider, FakeProvider } from './fake';
import type { LocalAiProvider, ProviderHealth, ProviderId } from './types';

/**
 * Process-wide provider instances and the last known health. Kept on globalThis so dev reloads and separate
 * route bundles share one login session / one concurrency guard. Health is a cache of LOCAL checks only; nothing
 * here runs inference.
 */
interface Registry {
  providers: Partial<Record<ProviderId, LocalAiProvider>>;
  health: Map<ProviderId, ProviderHealth>;
  checking: Map<ProviderId, Promise<ProviderHealth>>;
}
const g = globalThis as typeof globalThis & { __signalforgeAi?: Registry };
const registry: Registry = (g.__signalforgeAi ??= { providers: {}, health: new Map(), checking: new Map() });

/** E2E/demo mode: in-process fake providers, no CLI is ever spawned. Opt-in through the environment only. */
export function isFakeMode(): boolean {
  return process.env.SIGNALFORGE_AI_MODE === 'fake';
}

export function getProvider(id: ProviderId): LocalAiProvider {
  const existing = registry.providers[id];
  if (existing) return existing;
  const created: LocalAiProvider = isFakeMode()
    ? id === 'codex'
      ? new FakeCodexProvider(resolveDataDir)
      : new FakeProvider(id, resolveDataDir)
    : id === 'claude'
      ? new ClaudeProvider()
      : id === 'codex'
        ? new CodexProvider()
        : new GeminiProvider();
  registry.providers[id] = created;
  return created;
}

export function getCachedHealth(id: ProviderId): ProviderHealth | null {
  return registry.health.get(id) ?? null;
}

/** One local status check per provider at a time; concurrent callers share the same result. */
export function refreshHealth(id: ProviderId): Promise<ProviderHealth> {
  const running = registry.checking.get(id);
  if (running) return running;
  const previousInference = registry.health.get(id)?.lastInference;
  const promise = getProvider(id)
    .checkHealth()
    .then((h) => {
      const merged = previousInference && !h.lastInference ? { ...h, lastInference: previousInference } : h;
      registry.health.set(id, merged);
      return merged;
    })
    .finally(() => registry.checking.delete(id));
  registry.checking.set(id, promise);
  return promise;
}

export interface TestOutcome {
  ok: boolean;
  code: AiErrorCode | null;
  message: string;
  remediation: string | null;
  operationId: string;
}

/** A real (tiny) request. Only call after the user has consented in the UI. */
export async function runConnectionTest(id: ProviderId, signal?: AbortSignal): Promise<TestOutcome> {
  const provider = getProvider(id);
  let outcome: TestOutcome;
  try {
    await provider.testInference({ signal });
    outcome = { ok: true, code: null, message: 'Permintaan uji berhasil dijawab penyedia.', remediation: null, operationId: newOperationId() };
  } catch (error) {
    const e = isAiError(error) ? error : new AiError('PROVIDER_ERROR');
    outcome = { ok: false, code: e.code, message: e.message, remediation: e.remediation, operationId: e.operationId };
  }
  const cached = registry.health.get(id);
  if (cached) registry.health.set(id, { ...cached, lastInference: { at: new Date().toISOString(), ok: outcome.ok, code: outcome.code } });
  return outcome;
}
