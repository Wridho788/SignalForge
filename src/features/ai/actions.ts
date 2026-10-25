'use server';

import { z } from 'zod';
import { isAiError } from '@/lib/ai/errors';
import { getCachedHealth, getProvider, isFakeMode, refreshHealth, runConnectionTest, type TestOutcome } from '@/lib/ai/registry';
import { PROVIDER_IDS, PROVIDER_METHODS, PROVIDER_NAMES, type LoginState, type ProviderHealth, type ProviderId } from '@/lib/ai/types';

/** What the browser may know about a provider. Never a token, a path, or raw provider output. */
export interface ProviderSnapshot {
  provider: ProviderId;
  name: string;
  method: string;
  health: ProviderHealth | null;
  login: LoginState;
  /** Codex supports in-app device-code sign-in; Claude signs in through its own terminal command. */
  inAppLogin: boolean;
  testMode: boolean;
}

const providerSchema = z.enum(PROVIDER_IDS);

// Not exported: a 'use server' module exposes every export as a callable endpoint.
async function snapshotOf(provider: ProviderId): Promise<ProviderSnapshot> {
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
}

/** Local check only (installed? signed in?). Never runs inference. */
export async function checkStatusAction(raw: string): Promise<ProviderSnapshot> {
  const provider = providerSchema.parse(raw);
  await refreshHealth(provider);
  return snapshotOf(provider);
}

export async function readStateAction(raw: string): Promise<ProviderSnapshot> {
  const provider = providerSchema.parse(raw);
  const snap = await snapshotOf(provider);
  // A sign-in that just finished changes the answer to "am I connected?": re-check locally once.
  if (snap.login.state === 'completed') await refreshHealth(provider);
  return snapshotOf(provider);
}

/** Sends one tiny real request; the UI asks for consent first because it can use plan allowance. */
export async function testConnectionAction(raw: string, consented: boolean): Promise<{ snapshot: ProviderSnapshot; outcome: TestOutcome | null }> {
  const provider = providerSchema.parse(raw);
  if (consented !== true) return { snapshot: await snapshotOf(provider), outcome: null };
  if (!getCachedHealth(provider)) await refreshHealth(provider);
  const outcome = await runConnectionTest(provider);
  return { snapshot: await snapshotOf(provider), outcome };
}

export async function startLoginAction(raw: string): Promise<{ snapshot: ProviderSnapshot; error: string | null }> {
  const provider = providerSchema.parse(raw);
  const p = getProvider(provider);
  let error: string | null = null;
  if (!p.startLogin) return { snapshot: await snapshotOf(provider), error: 'Penyedia ini masuk lewat terminal. Ikuti panel “Cara menyiapkan”.' };
  try {
    await p.startLogin();
  } catch (e) {
    error = isAiError(e) ? `${e.message} ${e.remediation}` : 'Tidak dapat memulai login resmi.';
  }
  return { snapshot: await snapshotOf(provider), error };
}

export async function cancelLoginAction(raw: string): Promise<ProviderSnapshot> {
  const provider = providerSchema.parse(raw);
  await getProvider(provider).cancelLogin?.();
  return snapshotOf(provider);
}
