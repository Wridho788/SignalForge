import 'server-only';
import { getCachedHealth, getProvider, isFakeMode } from '@/lib/ai/registry';
import { PROVIDER_IDS, PROVIDER_METHODS, PROVIDER_NAMES } from '@/lib/ai/types';
import type { ProviderSnapshot } from './actions';

/** Cached view for server-rendered pages. Reads memory only: opening a page never spawns a CLI. */
export async function snapshotsForPage(): Promise<ProviderSnapshot[]> {
  return PROVIDER_IDS.map((provider) => {
    const p = getProvider(provider);
    return {
      provider,
      name: PROVIDER_NAMES[provider],
      method: PROVIDER_METHODS[provider],
      health: getCachedHealth(provider),
      login: p.loginState?.() ?? { state: 'idle' },
      inAppLogin: typeof p.startLogin === 'function',
      testMode: isFakeMode(),
    };
  });
}
