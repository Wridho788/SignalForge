'use server';

import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { getDb } from '@/lib/db/connection';
import { NotFoundError } from '@/lib/domain/errors';
import { errorState, type FormState } from '@/lib/form-state';
import { getDistribution } from '@/lib/services/distributions';
import { getAppSettings } from '@/lib/services/settings';
import {
  listApplicableMetrics,
  modeFieldName,
  recordSnapshot,
  valueFieldName,
  type EntryMode,
  type SnapshotEntryInput,
} from '@/lib/services/snapshots';
import { formDataToRecord } from '@/lib/validation/common';

const MODES: readonly EntryMode[] = ['value', 'not_available', 'not_applicable'];
const NOTE_MAX = 1000;

export async function recordSnapshotAction(
  episodeId: string,
  distributionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataToRecord(formData);
  try {
    const db = getDb();
    const distribution = getDistribution(db, distributionId);
    if (distribution.episodeId !== episodeId) throw new NotFoundError('Distribusi');

    // Entries come from the server-side metric list for this platform, never from client-supplied keys.
    const entries: SnapshotEntryInput[] = listApplicableMetrics(db, distribution.platformId).map((def) => {
      const rawMode = values[modeFieldName(def.id)] ?? 'value';
      return {
        metricDefinitionId: def.id,
        mode: (MODES as readonly string[]).includes(rawMode) ? (rawMode as EntryMode) : 'value',
        raw: values[valueFieldName(def.id)] ?? '',
      };
    });

    const note = (values.note ?? '').trim();
    if (note.length > NOTE_MAX) return errorState(values, { note: `Catatan maksimal ${NOTE_MAX} karakter.` });

    const result = recordSnapshot(
      db,
      distributionId,
      {
        capturedAtLocal: values.capturedAtLocal ?? '',
        note: note === '' ? null : note,
        supersedesSnapshotId: values.supersedes?.trim() ? values.supersedes.trim() : null,
        entries,
      },
      { timezone: getAppSettings(db).timezone, confirmWarnings: values.confirmWarnings === 'on' },
    );

    if (result.status === 'needs_confirmation') {
      return {
        status: 'needs_confirmation',
        message: 'Ada peringatan yang perlu Anda tinjau sebelum snapshot disimpan.',
        fieldErrors: {},
        values,
        warnings: result.warnings,
      };
    }
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/episodes/${episodeId}/distributions/${distributionId}?notice=snapshot-created`);
}
