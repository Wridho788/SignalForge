'use client';

import { useActionState } from 'react';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleState, type FormState } from '@/lib/form-state';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function FileUploadForm({
  action,
  label,
  accept,
  hint,
  submitLabel,
}: {
  action: Action;
  label: string;
  accept: string;
  hint: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const error = state.fieldErrors.file;
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormErrors state={state} />
      <div>
        <label htmlFor="file" className="field-label">
          {label}
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept={accept}
          aria-invalid={error ? true : undefined}
          aria-describedby={['file-hint', error ? 'file-error' : null].filter(Boolean).join(' ')}
          className="input file:mr-3 file:rounded-control file:border-0 file:bg-primary-soft file:px-3 file:py-1 file:font-semibold file:text-primary"
        />
        <p id="file-hint" className="field-hint">
          {hint}
        </p>
        {error && !state.message ? (
          <p id="file-error" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingLabel="Memproses…">{submitLabel}</SubmitButton>
    </form>
  );
}

export function CommitImportForm({
  action,
  duplicates,
  rejected,
}: {
  action: Action;
  duplicates: number;
  rejected: number;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="card space-y-4" noValidate>
      <h2 className="text-lg font-semibold">Impor</h2>
      <FormErrors state={state} />
      {duplicates > 0 ? (
        <SelectField
          name="duplicatePolicy"
          label={`Snapshot yang sudah ada pada waktu yang sama (${duplicates})`}
          defaultValue={state.values.duplicatePolicy ?? 'skip'}
          options={[
            { value: 'skip', label: 'Lewati (data yang ada tidak diubah)' },
            { value: 'supersede', label: 'Buat snapshot pengganti (yang lama tetap tersimpan sebagai riwayat)' },
          ]}
          hint="Snapshot bersifat append-only; tidak ada yang ditimpa."
        />
      ) : null}
      {rejected > 0 ? (
        <CheckboxField
          name="allowPartial"
          label={`Impor hanya baris yang valid dan abaikan ${rejected} baris yang ditolak`}
          hint="Tanpa centang ini, tidak ada yang diimpor selama masih ada baris tidak valid. Baris yang ditolak dicatat pada riwayat impor dan tidak masuk ke data."
          defaultChecked={state.values.allowPartial === 'on'}
        />
      ) : null}
      <SubmitButton pendingLabel="Mengimpor…">Impor sekarang</SubmitButton>
    </form>
  );
}

export function ConfirmRestoreForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormErrors state={state} />
      <TextField
        name="confirmText"
        label="Ketik PULIHKAN untuk mengonfirmasi"
        required
        defaultValue=""
        error={state.fieldErrors.confirmText}
        hint="Seluruh data saat ini akan diganti. Cadangan pra-pemulihan dibuat otomatis lebih dulu."
      />
      <SubmitButton variant="danger" pendingLabel="Memulihkan…">
        Pulihkan data
      </SubmitButton>
    </form>
  );
}
