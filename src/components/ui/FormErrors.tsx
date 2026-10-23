import type { FormState } from '@/lib/form-state';
import { Alert } from './feedback';

/** Form-level error summary. `role="alert"` so assistive tech announces it on submit. */
export function FormErrors({ state }: { state: FormState }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <Alert tone="danger" live="alert">
      {state.message}
    </Alert>
  );
}
