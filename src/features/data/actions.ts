'use server';

import path from 'node:path';
import { redirect } from 'next/navigation';
import { failureState } from '@/lib/action-helpers';
import { resolveDataDir } from '@/lib/config';
import { getDb } from '@/lib/db/connection';
import { NotFoundError } from '@/lib/domain/errors';
import { errorState, type FormState } from '@/lib/form-state';
import {
  MAX_RESTORE_BYTES,
  createBackup,
  discardStaged,
  restoreFromStaged,
  stageRestoreFile,
} from '@/lib/services/backup';
import { cancelImport, commitImport, stageImport } from '@/lib/services/imports';
import { getAppSettings } from '@/lib/services/settings';
import { formDataToRecord } from '@/lib/validation/common';
import { DEFAULT_CSV_LIMITS } from '@/lib/csv/csv';

const backupDir = () => path.join(resolveDataDir(), 'backups');

/** Pulls the uploaded file out of the form, enforcing a size cap BEFORE reading it into memory. */
async function readUpload(formData: FormData, maxBytes: number): Promise<{ name: string; bytes: Uint8Array } | string> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return 'Pilih file terlebih dahulu.';
  if (file.size > maxBytes) return `File terlalu besar (maksimal ${Math.round(maxBytes / 1024 / 1024)} MB).`;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function uploadImportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const upload = await readUpload(formData, DEFAULT_CSV_LIMITS.maxBytes);
  if (typeof upload === 'string') return errorState({}, { file: upload }, upload);
  let id: string;
  try {
    const db = getDb();
    id = stageImport(db, upload, getAppSettings(db).timezone);
  } catch (error) {
    return failureState({}, error);
  }
  redirect(`/imports/${id}`);
}

export async function commitImportAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  const policy = values.duplicatePolicy === 'supersede' ? 'supersede' : 'skip';
  try {
    const db = getDb();
    commitImport(db, id, { duplicatePolicy: policy, allowPartial: values.allowPartial === 'on' }, getAppSettings(db).timezone);
  } catch (error) {
    return failureState(values, error);
  }
  redirect(`/imports/${id}?notice=import-committed`);
}

export async function cancelImportAction(id: string, _prev: FormState): Promise<FormState> {
  try {
    cancelImport(getDb(), id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) return failureState({}, error);
  }
  redirect('/imports?notice=import-cancelled');
}

export async function createBackupAction(_prev: FormState): Promise<FormState> {
  try {
    createBackup(getDb(), backupDir(), 'manual');
  } catch (error) {
    return failureState({}, error);
  }
  redirect('/imports/backup?notice=backup-created');
}

export async function uploadRestoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const upload = await readUpload(formData, MAX_RESTORE_BYTES);
  if (typeof upload === 'string') return errorState({}, { file: upload }, upload);
  let token: string;
  try {
    token = stageRestoreFile(resolveDataDir(), upload.bytes).token;
  } catch (error) {
    return failureState({}, error);
  }
  redirect(`/imports/backup/restore/${token}`);
}

/** The typed confirmation is re-checked here; the page alone is not a safeguard. */
export async function confirmRestoreAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToRecord(formData);
  if (values.confirmText !== 'PULIHKAN') {
    return errorState(values, { confirmText: 'Ketik PULIHKAN persis seperti itu untuk melanjutkan.' });
  }
  try {
    restoreFromStaged(getDb(), resolveDataDir(), backupDir(), token);
  } catch (error) {
    return failureState(values, error);
  }
  redirect('/imports/backup?notice=restore-done');
}

export async function cancelRestoreAction(token: string, _prev: FormState): Promise<FormState> {
  discardStaged(resolveDataDir(), token);
  redirect('/imports/backup');
}
