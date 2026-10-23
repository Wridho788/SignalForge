/** Shape returned by server actions to `useActionState` forms. Contains no secrets or DB rows. */
export interface FormState {
  status: 'idle' | 'error' | 'needs_confirmation';
  /** Form-level message (summary or non-field error). */
  message?: string;
  fieldErrors: Record<string, string>;
  /** Submitted values echoed back so the form can re-render exactly what the user typed. */
  values: Record<string, string>;
  warnings: string[];
}

export const idleState: FormState = { status: 'idle', fieldErrors: {}, values: {}, warnings: [] };

export function errorState(
  values: Record<string, string>,
  fieldErrors: Record<string, string>,
  message?: string,
): FormState {
  const hasFields = Object.keys(fieldErrors).filter((k) => k !== '_form').length > 0;
  return {
    status: 'error',
    message: message ?? fieldErrors._form ?? (hasFields ? 'Periksa kembali isian yang ditandai.' : undefined),
    fieldErrors,
    values,
    warnings: [],
  };
}
