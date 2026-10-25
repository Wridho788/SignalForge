import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuMinus, LuTriangleAlert } from 'react-icons/lu';
import { Badge } from '@/components/ui/feedback';
import { PROVIDER_STATUS_LABELS, type ProviderStatus } from '@/lib/ai/types';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<ProviderStatus, Tone> = {
  connected: 'success',
  not_authenticated: 'warning',
  not_installed: 'neutral',
  checking: 'info',
  rate_limited: 'warning',
  unavailable: 'neutral',
  error: 'danger',
};

/** Text label + icon: status is never conveyed by color alone. */
export function StatusBadge({ status }: { status: ProviderStatus }) {
  const Icon = status === 'connected' ? LuCircleCheck : status === 'checking' ? LuLoaderCircle : status === 'error' ? LuCircleAlert : status === 'not_installed' || status === 'unavailable' ? LuMinus : LuTriangleAlert;
  return (
    <Badge tone={TONE[status]}>
      <Icon aria-hidden="true" className={status === 'checking' ? 'animate-spin' : undefined} />
      {PROVIDER_STATUS_LABELS[status]}
    </Badge>
  );
}
