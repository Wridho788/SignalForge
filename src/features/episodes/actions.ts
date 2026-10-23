'use server';

import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { getDb } from '@/lib/db/connection';
import { NotFoundError } from '@/lib/domain/errors';
import { errorState, type FormState } from '@/lib/form-state';
import { createEpisode, deleteEpisode, updateEpisode } from '@/lib/services/episodes';
import { formDataToRecord, parseInput } from '@/lib/validation/common';
import { episodeInputSchema } from '@/lib/validation/episode';

export async function createEpisodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(episodeInputSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  let id: string;
  try {
    id = createEpisode(getDb(), parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/episodes/${id}?notice=episode-created`);
}

export async function updateEpisodeAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(episodeInputSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    updateEpisode(getDb(), id, parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/episodes/${id}?notice=episode-updated`);
}

/** Reached only from the dedicated confirmation page (a deliberate, separate step). */
export async function deleteEpisodeAction(id: string): Promise<void> {
  try {
    deleteEpisode(getDb(), id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  redirect('/episodes?notice=episode-deleted');
}
