import 'server-only';
import { notFound } from 'next/navigation';
import { NotFoundError } from './domain/errors';

/** Runs a loader and turns a domain NotFoundError into Next's 404 page. */
export function orNotFound<T>(load: () => T): T {
  try {
    return load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const firstParam = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
