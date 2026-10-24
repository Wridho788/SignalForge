'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  DECISIONS,
  DECISION_LABELS,
  DESIGNS,
  DESIGN_LABELS,
  ROLES,
  ROLE_LABELS,
  SUCCESS_TYPES,
  SUCCESS_TYPE_LABELS,
} from '@/lib/experiments/model';
import { idleState, type FormState } from '@/lib/form-state';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export interface MetricChoice {
  id: string;
  label: string;
  unit: string;
  platformName: string | null;
}

export function ExperimentForm({
  action,
  initial,
  metrics,
  windows,
  submitLabel,
  cancelHref,
}: {
  action: Action;
  initial: Record<string, string>;
  metrics: MetricChoice[];
  windows: { hours: number; toleranceHours: number }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const v = (n: string) => state.values[n] ?? initial[n] ?? '';
  const e = (n: string) => state.fieldErrors[n];
  const primary = v('primaryMetricId') || metrics[0]?.id || '';
  const checked = (id: string) => (state.status === 'idle' ? initial[`secondary__${id}`] === 'on' : state.values[`secondary__${id}`] === 'on');

  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <TextField name="title" label="Judul eksperimen" required maxLength={200} defaultValue={v('title')} error={e('title')} />
      <TextAreaField
        name="hypothesis"
        label="Hipotesis"
        required
        rows={3}
        maxLength={2000}
        defaultValue={v('hypothesis')}
        error={e('hypothesis')}
        hint='Tulis sebagai pernyataan yang bisa salah, mis. "Hook berbentuk pertanyaan menaikkan views pada 24 jam."'
      />
      <TextAreaField name="rationale" label="Rasional" rows={2} maxLength={3000} defaultValue={v('rationale')} error={e('rationale')} hint="Opsional. Mengapa Anda menduga ini?" />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="variableToTest" label="Variabel yang diuji" required maxLength={500} defaultValue={v('variableToTest')} error={e('variableToTest')} hint="Satu hal yang sengaja Anda ubah." />
        <TextField name="targetAudience" label="Target audiens" maxLength={500} defaultValue={v('targetAudience')} error={e('targetAudience')} hint="Opsional." />
      </div>
      <SelectField
        name="design"
        label="Desain perbandingan"
        required
        defaultValue={v('design') || 'concurrent'}
        options={DESIGNS.map((d) => ({ value: d, label: DESIGN_LABELS[d] }))}
        error={e('design')}
        hint="Sebelum/sesudah tidak dapat memisahkan efek variabel dari faktor lain; hasilnya hanya indikasi lemah."
      />

      <fieldset className="space-y-5 rounded-control border border-line p-4">
        <legend className="px-1 font-semibold">Ukuran dan kriteria sukses (ditetapkan sebelum melihat hasil)</legend>
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField
            name="primaryMetricId"
            label="Metrik utama"
            required
            defaultValue={primary}
            options={metrics.map((m) => ({ value: m.id, label: `${m.label} (${m.unit})${m.platformName ? ` · ${m.platformName}` : ''}` }))}
            error={e('primaryMetricId')}
          />
          <SelectField
            name="windowHours"
            label="Usia perbandingan"
            required
            defaultValue={v('windowHours') || String(windows[0]?.hours ?? '')}
            options={windows.map((w) => ({ value: String(w.hours), label: `${w.hours} jam ± ${w.toleranceHours} jam` }))}
            error={e('windowHours')}
            hint="Dari Pengaturan. Semua post dibaca pada usia yang setara."
          />
          <SelectField
            name="successType"
            label="Jenis kriteria sukses"
            required
            defaultValue={v('successType') || 'min_relative_gain'}
            options={SUCCESS_TYPES.map((t) => ({ value: t, label: SUCCESS_TYPE_LABELS[t] }))}
            error={e('successType')}
          />
          <TextField
            name="successValue"
            label="Nilai ambang"
            required
            inputMode="decimal"
            defaultValue={v('successValue')}
            error={e('successValue')}
            hint="Untuk kenaikan relatif: persentase (mis. 20). Untuk nilai minimal: angka dalam satuan metrik (rasio dalam %)."
          />
        </div>
        <fieldset>
          <legend className="field-label">Metrik sekunder (opsional)</legend>
          {e('secondaryMetricIds') ? <p className="field-error">{e('secondaryMetricIds')}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {metrics.map((m) => (
              <CheckboxField key={m.id} name={`secondary__${m.id}`} label={`${m.label} (${m.unit})`} defaultChecked={checked(m.id)} />
            ))}
          </div>
          <p className="field-hint">Hanya ditampilkan sebagai konteks; tidak menentukan sukses.</p>
        </fieldset>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}

/** A small form whose only inputs are server-rendered children (buttons, selects). Shows errors inline. */
export function InlineActionForm({
  action,
  submitLabel,
  variant = 'primary',
  children,
  pendingLabel,
}: {
  action: (prev: FormState) => Promise<FormState>;
  submitLabel: string;
  variant?: 'primary' | 'danger' | 'secondary';
  children?: ReactNode;
  pendingLabel?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="space-y-2">
      {children}
      {variant === 'secondary' ? <SecondarySubmit label={submitLabel} /> : <SubmitButton variant={variant === 'danger' ? 'danger' : 'primary'} pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>}
      <FormErrors state={state} />
    </form>
  );
}

function SecondarySubmit({ label }: { label: string }) {
  // Same button element as SubmitButton but with the secondary look.
  return (
    <button type="submit" className="btn btn-secondary">
      {label}
    </button>
  );
}

export function LinkForm({
  action,
  options,
}: {
  action: Action;
  options: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="card mt-4 space-y-3" noValidate>
      <h3 className="font-semibold">Tautkan distribusi</h3>
      <FormErrors state={state} />
      <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
        <SelectField
          name="distributionId"
          label="Distribusi"
          defaultValue={state.values.distributionId ?? ''}
          options={[{ value: '', label: 'Pilih distribusi…' }, ...options]}
          error={state.fieldErrors.distributionId}
        />
        <SelectField
          name="role"
          label="Peran"
          defaultValue={state.values.role ?? 'variant'}
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          error={state.fieldErrors.role}
        />
      </div>
      <p className="field-hint">
        Baseline = pembanding; Varian = yang memakai variabel uji; Pendukung = konteks (tidak dihitung dalam bukti). Pilih distribusi
        yang diterbitkan pada periode yang sebanding.
      </p>
      <SubmitButton pendingLabel="Menautkan…">Tautkan</SubmitButton>
    </form>
  );
}

export function NoteForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="mt-4 space-y-3" noValidate>
      <FormErrors state={state} />
      <TextAreaField name="note" label="Tambah catatan ke log" rows={2} maxLength={2000} defaultValue={state.values.note ?? ''} error={state.fieldErrors.note} />
      <SubmitButton pendingLabel="Menyimpan…">Simpan catatan</SubmitButton>
    </form>
  );
}

export function OutcomeForm({ action, cancelHref }: { action: Action; cancelHref: string }) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <SelectField
        name="decision"
        label="Keputusan"
        required
        defaultValue={state.values.decision ?? 'inconclusive'}
        options={DECISIONS.map((d) => ({ value: d, label: DECISION_LABELS[d] }))}
        error={state.fieldErrors.decision}
        hint="Tidak konklusif adalah hasil yang sah — pilih ini bila data tidak cukup atau perbandingan tidak setara."
      />
      <TextAreaField
        name="learning"
        label="Pembelajaran"
        required
        rows={5}
        maxLength={5000}
        defaultValue={state.values.learning ?? ''}
        error={state.fieldErrors.learning}
        hint='Apa yang Anda pelajari dan lakukan berikutnya? Gunakan kata "indikasi"/"hipotesis" kecuali eksperimen terkontrol.'
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Menyimpan…">Simpan hasil</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}
