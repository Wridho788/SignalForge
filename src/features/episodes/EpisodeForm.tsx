'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleState, type FormState } from '@/lib/form-state';

export function EpisodeForm({
  action,
  initial,
  tagSuggestions,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  tagSuggestions: string[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const v = (name: string) => state.values[name] ?? initial[name] ?? '';
  const e = (name: string) => state.fieldErrors[name];

  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <TextField name="title" label="Judul" required maxLength={200} defaultValue={v('title')} error={e('title')} />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="workingTitle" label="Judul kerja" maxLength={200} defaultValue={v('workingTitle')} error={e('workingTitle')} />
        <TextField
          name="episodeCode"
          label="Kode episode"
          hint="Opsional, unik. Huruf/angka, boleh . _ - (mis. EP-014)."
          maxLength={32}
          defaultValue={v('episodeCode')}
          error={e('episodeCode')}
        />
        <TextField name="format" label="Format" hint="Mis. cerita pendek, penjelasan." maxLength={80} defaultValue={v('format')} error={e('format')} />
        <TextField
          name="durationSeconds"
          label="Durasi"
          hint="Detik (90) atau mm:ss (1:30). Kosong = tidak diketahui."
          inputMode="text"
          defaultValue={v('durationSeconds')}
          error={e('durationSeconds')}
        />
      </div>
      <TextAreaField name="premise" label="Premis / ringkasan" rows={3} maxLength={2000} defaultValue={v('premise')} error={e('premise')} />
      <TextAreaField name="scriptText" label="Naskah" rows={6} maxLength={50000} defaultValue={v('scriptText')} error={e('scriptText')}
        hint="Tidak dikirim ke AI secara default." />
      <TextAreaField name="notes" label="Catatan" rows={3} maxLength={5000} defaultValue={v('notes')} error={e('notes')} />
      <TextField
        name="tags"
        label="Tag"
        hint={
          tagSuggestions.length > 0
            ? `Pisahkan dengan koma. Tag yang sudah ada: ${tagSuggestions.join(', ')}.`
            : 'Pisahkan dengan koma (mis. horor, kota). Tag adalah label, bukan bukti sebab-akibat.'
        }
        defaultValue={v('tags')}
        error={e('tags')}
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}
