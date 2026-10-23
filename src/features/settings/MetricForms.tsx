'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AGGREGATION_KINDS, AGGREGATION_KIND_LABELS } from '@/lib/domain/types';
import { idleState, type FormState } from '@/lib/form-state';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function MetricCreateForm({ action, platforms }: { action: Action; platforms: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, idleState);
  const v = (n: string) => state.values[n] ?? '';
  const e = (n: string) => state.fieldErrors[n];
  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="label" label="Label" required maxLength={80} defaultValue={v('label')} error={e('label')} />
        <TextField
          name="key"
          label="Kunci"
          required
          maxLength={60}
          hint="Huruf kecil, angka, garis bawah. Tidak bisa diubah setelah dibuat."
          defaultValue={v('key')}
          error={e('key')}
        />
        <SelectField
          name="aggregationKind"
          label="Jenis"
          required
          defaultValue={v('aggregationKind') || 'counter'}
          options={AGGREGATION_KINDS.map((k) => ({ value: k, label: AGGREGATION_KIND_LABELS[k] }))}
          error={e('aggregationKind')}
          hint="Jenis dan satuan tidak bisa diubah setelah dibuat, agar nilai lama tetap bermakna."
        />
        <TextField name="unit" label="Satuan" required maxLength={40} defaultValue={v('unit')} error={e('unit')} hint="Mis. views, detik, rasio." />
        <SelectField
          name="platformId"
          label="Berlaku untuk"
          defaultValue={v('platformId')}
          options={[{ value: '', label: 'Semua platform (definisi bersama)' }, ...platforms.map((p) => ({ value: p.id, label: `Hanya ${p.name}` }))]}
          error={e('platformId')}
        />
        <TextField
          name="currencyCode"
          label="Kode mata uang"
          maxLength={3}
          hint="Wajib hanya untuk jenis Mata uang (mis. IDR)."
          defaultValue={v('currencyCode')}
          error={e('currencyCode')}
        />
      </div>
      <CheckboxField name="allowNegative" label="Izinkan nilai negatif" hint="Mis. perubahan pengikut bersih. Default: nilai harus ≥ 0." defaultChecked={v('allowNegative') === 'on'} />
      <TextAreaField name="description" label="Deskripsi" rows={2} maxLength={500} defaultValue={v('description')} error={e('description')} />
      <TextAreaField
        name="sourceDefinition"
        label="Definisi sumber"
        rows={3}
        maxLength={1000}
        defaultValue={v('sourceDefinition')}
        error={e('sourceDefinition')}
        hint="Bagaimana platform mendefinisikan metrik ini (rujuk dokumentasi/dasbor platform). Definisi antar-platform tidak otomatis setara."
      />
      <TextField name="formulaVersion" label="Versi formula" maxLength={40} defaultValue={v('formulaVersion')} error={e('formulaVersion')} hint="Opsional, untuk metrik turunan." />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Buat metrik</SubmitButton>
        <Link href="/settings/metrics" className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}

export function MetricEditForm({ action, initial }: { action: Action; initial: Record<string, string> }) {
  const [state, formAction] = useActionState(action, idleState);
  const v = (n: string) => state.values[n] ?? initial[n] ?? '';
  const e = (n: string) => state.fieldErrors[n];
  const active = state.status === 'idle' ? initial.isActive === 'on' : state.values.isActive === 'on';
  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <TextField name="label" label="Label" required maxLength={80} defaultValue={v('label')} error={e('label')} />
      <TextAreaField name="description" label="Deskripsi" rows={2} maxLength={500} defaultValue={v('description')} error={e('description')} />
      <TextAreaField
        name="sourceDefinition"
        label="Definisi sumber"
        rows={3}
        maxLength={1000}
        defaultValue={v('sourceDefinition')}
        error={e('sourceDefinition')}
        hint="Bagaimana platform mendefinisikan metrik ini. Kosong = belum dicatat (ditandai di form snapshot)."
      />
      <TextField name="formulaVersion" label="Versi formula" maxLength={40} defaultValue={v('formulaVersion')} error={e('formulaVersion')} />
      <CheckboxField
        name="isActive"
        label="Aktif"
        hint="Metrik nonaktif tidak muncul di form snapshot baru; nilai lama tetap tersimpan dan tampil."
        defaultChecked={active}
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton>Simpan</SubmitButton>
        <Link href="/settings/metrics" className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}
