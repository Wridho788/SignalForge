import 'server-only';
import { DomainError, NotFoundError } from './domain/errors';
import { errorState, type FormState } from './form-state';

/**
 * Maps a thrown error to form state. Domain errors are user-fixable and shown as-is. Anything else
 * is logged (name + truncated message only — no request data) and shown with an operation id.
 */
export function failureState(values: Record<string, string>, error: unknown): FormState {
  if (error instanceof DomainError) return errorState(values, error.fieldErrors, error.message);
  if (error instanceof NotFoundError) return errorState(values, {}, error.message);
  const operationId = crypto.randomUUID().slice(0, 8);
  const name = error instanceof Error ? error.name : 'UnknownError';
  const detail = error instanceof Error ? error.message.slice(0, 200) : '';
  console.error(`[op ${operationId}] unexpected ${name}: ${detail}`);
  return errorState(values, {}, `Terjadi kesalahan tak terduga. Kode operasi: ${operationId}.`);
}
