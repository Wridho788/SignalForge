'use server';

import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { getDb } from '@/lib/db/connection';
import { NotFoundError } from '@/lib/domain/errors';
import { EXPERIMENT_STATUSES, type ExperimentStatus } from '@/lib/experiments/model';
import { errorState, type FormState } from '@/lib/form-state';
import { listAnalyticsMetrics } from '@/lib/services/analytics';
import {
  addNote,
  createExperiment,
  deleteExperiment,
  linkDistribution,
  recordOutcome,
  transitionExperiment,
  unlinkDistribution,
  updateExperiment,
} from '@/lib/services/experiments';
import { formDataToRecord, parseInput } from '@/lib/validation/common';
import { experimentInputSchema, linkSchema, noteSchema, outcomeSchema, type ExperimentInput } from '@/lib/validation/experiment';

/** Secondary metrics come from the server-side list of numeric metrics, never from client-supplied key names. */
function secondaryIds(values: Record<string, string>): string[] {
  return listAnalyticsMetrics(getDb())
    .filter((m) => values[`secondary__${m.id}`] === 'on')
    .map((m) => m.id);
}

function parseExperiment(values: Record<string, string>):
  | { ok: true; data: ExperimentInput }
  | { ok: false; state: FormState } {
  const parsed = parseInput(experimentInputSchema, values);
  if (!parsed.ok) return { ok: false, state: errorState(values, parsed.fieldErrors) };
  return { ok: true, data: { ...parsed.data, secondaryMetricIds: secondaryIds(values) } };
}

export async function createExperimentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseExperiment(values);
  if (!parsed.ok) return parsed.state;
  let id: string;
  try {
    id = createExperiment(getDb(), parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/experiments/${id}?notice=experiment-created`);
}

export async function updateExperimentAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseExperiment(values);
  if (!parsed.ok) return parsed.state;
  try {
    updateExperiment(getDb(), id, parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/experiments/${id}?notice=experiment-updated`);
}

/** `to` is bound by the page and re-validated here (actions are reachable by direct POST). */
export async function transitionAction(id: string, to: string, _prev: FormState): Promise<FormState> {
  if (!(EXPERIMENT_STATUSES as readonly string[]).includes(to)) return errorState({}, {}, 'Status tidak dikenal.');
  try {
    transitionExperiment(getDb(), id, to as ExperimentStatus);
  } catch (error) {
    return failureState({}, error);
  }
  redirect(`/experiments/${id}?notice=experiment-status`);
}

export async function linkAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(linkSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    linkDistribution(getDb(), id, parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/experiments/${id}?notice=experiment-linked`);
}

export async function unlinkAction(id: string, distributionId: string, _prev: FormState): Promise<FormState> {
  try {
    unlinkDistribution(getDb(), id, distributionId);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/experiments/${id}`);
    return failureState({}, error);
  }
  redirect(`/experiments/${id}?notice=experiment-unlinked`);
}

export async function outcomeAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(outcomeSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    recordOutcome(getDb(), id, parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/experiments/${id}?notice=experiment-outcome`);
}

export async function noteAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(noteSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    addNote(getDb(), id, parsed.data.note);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/experiments/${id}?notice=experiment-note`);
}

/** Reached only from the confirmation page. */
export async function deleteExperimentAction(id: string, _prev: FormState): Promise<FormState> {
  try {
    deleteExperiment(getDb(), id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect('/experiments');
    return failureState({}, error);
  }
  redirect('/experiments?notice=experiment-deleted');
}
