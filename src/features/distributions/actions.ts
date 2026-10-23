'use server';

import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { getDb } from '@/lib/db/connection';
import { NotFoundError } from '@/lib/domain/errors';
import { errorState, type FormState } from '@/lib/form-state';
import { createDistribution, deleteDistribution, updateDistribution } from '@/lib/services/distributions';
import { getAppSettings } from '@/lib/services/settings';
import { formDataToRecord, parseInput } from '@/lib/validation/common';
import { distributionInputSchema } from '@/lib/validation/distribution';

export async function createDistributionAction(
  episodeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(distributionInputSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  let id: string;
  try {
    const db = getDb();
    id = createDistribution(db, episodeId, parsed.data, getAppSettings(db).timezone);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/episodes/${episodeId}/distributions/${id}?notice=distribution-created`);
}

export async function updateDistributionAction(
  episodeId: string,
  distributionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(distributionInputSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    const db = getDb();
    updateDistribution(db, distributionId, parsed.data, getAppSettings(db).timezone);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/episodes/${episodeId}/distributions/${distributionId}?notice=distribution-updated`);
}

/** Reached only from the dedicated confirmation page. */
export async function deleteDistributionAction(episodeId: string, distributionId: string): Promise<void> {
  try {
    deleteDistribution(getDb(), distributionId);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  redirect(`/episodes/${episodeId}?notice=distribution-deleted`);
}
