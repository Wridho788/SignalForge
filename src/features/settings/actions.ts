'use server';

import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { getDb } from '@/lib/db/connection';
import { errorState, type FormState } from '@/lib/form-state';
import { createMetricDefinition, updateMetricDefinition } from '@/lib/services/metric-definitions';
import { updateAppSettings } from '@/lib/services/settings';
import { formDataToRecord, parseInput } from '@/lib/validation/common';
import { metricDefinitionCreateSchema, metricDefinitionUpdateSchema } from '@/lib/validation/metric-definition';
import { MAX_COMPARISON_WINDOWS, type ComparisonWindow } from '@/lib/validation/settings';

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const fieldErrors: Record<string, string> = {};
  const windows: ComparisonWindow[] = [];

  for (let i = 0; i < MAX_COMPARISON_WINDOWS; i++) {
    const hoursRaw = (values[`window_hours_${i}`] ?? '').trim();
    const tolRaw = (values[`window_tolerance_${i}`] ?? '').trim();
    if (hoursRaw === '' && tolRaw === '') continue; // empty row ignored
    if (!/^\d{1,4}$/.test(hoursRaw)) {
      fieldErrors[`window_hours_${i}`] = 'Jam bulat positif.';
      continue;
    }
    if (!/^\d{1,4}$/.test(tolRaw === '' ? '0' : tolRaw)) {
      fieldErrors[`window_tolerance_${i}`] = 'Jam bulat (≥ 0).';
      continue;
    }
    windows.push({ hours: Number(hoursRaw), toleranceHours: Number(tolRaw === '' ? '0' : tolRaw) });
  }
  if (Object.keys(fieldErrors).length > 0) return errorState(values, fieldErrors);

  try {
    updateAppSettings(getDb(), { timezone: (values.timezone ?? '').trim(), comparisonWindows: windows });
  } catch (error) {
    return failureState(values, error);
  }
  redirect('/settings?notice=settings-saved');
}

export async function createMetricAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(metricDefinitionCreateSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    createMetricDefinition(getDb(), parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect('/settings/metrics?notice=metric-created');
}

export async function updateMetricAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const parsed = parseInput(metricDefinitionUpdateSchema, values);
  if (!parsed.ok) return errorState(values, parsed.fieldErrors);
  try {
    updateMetricDefinition(getDb(), id, parsed.data);
  } catch (error) {
    return failureState(values, error);
  }
  redirect('/settings/metrics?notice=metric-updated');
}
