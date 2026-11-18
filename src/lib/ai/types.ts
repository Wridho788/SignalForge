export const PROVIDER_IDS = ['claude', 'codex', 'gemini'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_NAMES: Record<ProviderId, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

/** Integration method shown on the provider card (AI_CONNECTIONS.md §3). */
export const PROVIDER_METHODS: Record<ProviderId, string> = {
  claude: 'Claude Code CLI (mode non-interaktif, tanpa tool)',
  codex: 'Codex app-server (JSON-RPC via stdio)',
  gemini: 'Gemini Developer API (Free Tier)',
};

export type ProviderStatus =
  | 'not_installed'
  | 'not_authenticated'
  | 'checking'
  | 'connected'
  | 'rate_limited'
  | 'unavailable'
  | 'error';

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  not_installed: 'Belum terpasang',
  not_authenticated: 'Perlu masuk',
  checking: 'Memeriksa',
  connected: 'Terhubung',
  rate_limited: 'Batas pemakaian tercapai',
  unavailable: 'Tidak tersedia',
  error: 'Galat',
};

/** Result of the last inference test (a real request), kept separate from "installed" and "signed in". */
export interface InferenceCheck {
  at: string;
  ok: boolean;
  code: string | null;
}

export interface ProviderHealth {
  provider: ProviderId;
  status: ProviderStatus;
  checkedAt: string;
  displayMessage: string;
  remediation?: string;
  /** Never a token or credential path. Plan label only if the official protocol reports one. */
  planLabel?: string;
  installed: boolean;
  version?: string;
  /** null = could not be determined. */
  authenticated: boolean | null;
  /** True when the CLI reports API-key/console billing instead of a subscription (we never fall back silently). */
  apiBilling?: boolean;
  lastInference?: InferenceCheck;
  /** Stable code for the last problem, if any. */
  errorCode?: string;
}

export interface AnalysisRequest {
  /** Full prompt text (rules + fenced data). Built by lib/ai/analysis.ts; bounded before it reaches a provider. */
  prompt: string;
  maxOutputChars: number;
}

export interface AnalysisResult {
  provider: ProviderId;
  text: string;
  model: string | null;
  durationMs: number;
}

export interface LoginInfo {
  provider: ProviderId;
  /** Device-code flow: the page to open and the one-time code to enter there. Not a credential. */
  verificationUrl: string;
  userCode: string;
  startedAt: string;
}

export type LoginState =
  | { state: 'idle' }
  | { state: 'pending'; info: LoginInfo }
  | { state: 'completed'; at: string }
  | { state: 'failed'; at: string; code: string };

export interface RunOptions {
  signal?: AbortSignal;
}

export interface LocalAiProvider {
  readonly id: ProviderId;
  /** Local, cheap: is the CLI installed and signed in? Never runs inference. */
  checkHealth(options?: RunOptions): Promise<ProviderHealth>;
  /** A minimal real request, only after explicit user consent (may use plan allowance). */
  testInference(options?: RunOptions): Promise<void>;
  analyze(request: AnalysisRequest, options?: RunOptions): Promise<AnalysisResult>;
  /** Starts the OFFICIAL sign-in flow if the provider supports it in-app; null when it must be done in a terminal. */
  startLogin?(): Promise<LoginInfo>;
  cancelLogin?(): Promise<void>;
  loginState?(): LoginState;
}
