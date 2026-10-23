'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { TextAreaField } from '@/components/ui/Field';
import { Alert, Badge } from '@/components/ui/feedback';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AggregationKind } from '@/lib/domain/types';
import { idleState, type FormState } from '@/lib/form-state';
import { utcOffsetLabel } from '@/lib/time';

export interface SnapshotMetricView {
  id: string;
  label: string;
  unit: string;
  aggregationKind: AggregationKind;
  currencyCode: string | null;
  allowNegative: boolean;
  platformName: string | null;
  hasSourceDefinition: boolean;
}

const VALUE_HINT: Record<AggregationKind, (m: SnapshotMetricView) => string> = {
  counter: (m) => `Bilangan bulat${m.allowNegative ? ' (boleh negatif)' : ''}, tanpa pemisah ribuan.`,
  ratio: () => 'Persentase 0–100 (mis. 12,5).',
  duration: () => 'Detik (desimal pakai koma atau titik).',
  currency: (m) => `Jumlah dalam ${m.currencyCode ?? 'mata uang'}.`,
  categorical: () => 'Teks, maksimal 200 karakter.',
};

function MetricRow({
  metric,
  state,
  initialValues,
}: {
  metric: SnapshotMetricView;
  state: FormState;
  initialValues: Record<string, string>;
}) {
  const modeName = `mode__${metric.id}`;
  const valueName = `value__${metric.id}`;
  const val = (name: string) => state.values[name] ?? initialValues[name];
  const [mode, setMode] = useState(val(modeName) ?? 'value');
  const error = state.fieldErrors[valueName];
  const hintId = `${valueName}-hint`;
  const errorId = `${valueName}-error`;

  return (
    <div className="grid gap-3 border-b border-line py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_14rem_minmax(0,1fr)] md:items-start">
      <div>
        <p className="font-semibold">{metric.label}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>Satuan: {metric.unit}</span>
          {metric.platformName ? <Badge tone="neutral">Khusus {metric.platformName}</Badge> : null}
        </p>
      </div>
      <div>
        <label htmlFor={modeName} className="field-label">
          Status nilai<span className="sr-only"> {metric.label}</span>
        </label>
        <select
          id={modeName}
          name={modeName}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="input"
        >
          <option value="value">Isi nilai / tidak diketahui</option>
          <option value="not_available">Tidak tersedia di platform</option>
          <option value="not_applicable">Tidak berlaku</option>
        </select>
      </div>
      <div>
        <label htmlFor={valueName} className="field-label">
          Nilai<span className="sr-only"> {metric.label}</span>
        </label>
        <input
          id={valueName}
          name={valueName}
          type="text"
          inputMode={metric.aggregationKind === 'categorical' ? 'text' : 'decimal'}
          autoComplete="off"
          disabled={mode !== 'value'}
          defaultValue={mode === 'value' ? (val(valueName) ?? '') : ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ')}
          className="input disabled:bg-canvas"
          placeholder={mode === 'value' ? 'Kosong = tidak diketahui' : '—'}
        />
        <p id={hintId} className="field-hint">
          {mode === 'value' ? VALUE_HINT[metric.aggregationKind](metric) : 'Nilai tidak disimpan untuk status ini.'}
        </p>
        {error ? (
          <p id={errorId} className="field-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SnapshotForm({
  action,
  metrics,
  timezone,
  defaultCapturedAt,
  initialValues,
  supersedes,
  publishedAtKnown,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  metrics: SnapshotMetricView[];
  timezone: string;
  defaultCapturedAt: string;
  /** Pre-filled field values (used when correcting an existing snapshot). */
  initialValues: Record<string, string>;
  /** When correcting a snapshot: its id and a short description. */
  supersedes: { id: string; description: string } | null;
  publishedAtKnown: boolean;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const needsConfirm = state.status === 'needs_confirmation';
  const capturedAt = state.values.capturedAtLocal ?? initialValues.capturedAtLocal ?? defaultCapturedAt;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormErrors state={state} />
      {supersedes ? (
        <>
          <input type="hidden" name="supersedes" value={supersedes.id} />
          <Alert tone="info" title="Koreksi snapshot">
            Anda membuat snapshot pengganti untuk {supersedes.description}. Snapshot lama tidak diubah atau dihapus;
            ia ditandai sudah dikoreksi.
          </Alert>
        </>
      ) : null}
      {metrics.some((m) => !m.hasSourceDefinition) ? (
        <Alert tone="info" title="Definisi sumber">
          {metrics.filter((m) => !m.hasSourceDefinition).length} dari {metrics.length} metrik belum punya definisi
          sumber, jadi arti angkanya di platform belum tercatat.{' '}
          <Link href="/settings/metrics" className="text-primary underline">
            Lengkapi di Pengaturan → Metrik
          </Link>
          .
        </Alert>
      ) : null}
      {!publishedAtKnown ? (
        <Alert tone="warning" title="Waktu terbit belum diketahui">
          Usia post untuk snapshot ini akan tersimpan sebagai tidak diketahui, sehingga tidak bisa dipakai untuk
          perbandingan usia setara.
        </Alert>
      ) : null}

      <div className="card space-y-5">
        <DateTimeField
          key={capturedAt}
          name="capturedAtLocal"
          label="Waktu pengambilan data"
          required
          timezone={timezone}
          defaultValue={capturedAt}
          error={state.fieldErrors.capturedAtLocal}
          hint={`Kapan Anda membaca angka dari dasbor platform. Zona waktu: ${timezone} (${utcOffsetLabel(timezone)}).`}
        />
        <TextAreaField
          name="note"
          label="Catatan snapshot"
          rows={2}
          maxLength={1000}
          defaultValue={state.values.note ?? initialValues.note ?? ''}
          error={state.fieldErrors.note}
          hint="Opsional. Mis. rentang waktu yang ditampilkan dasbor platform."
        />
      </div>

      <fieldset className="card">
        <legend className="px-1 text-lg font-semibold">Metrik</legend>
        <p className="field-hint mt-0">
          Isi hanya yang Anda ketahui. Kolom kosong berarti <strong>tidak diketahui</strong> dan tidak disimpan;{' '}
          <strong>0</strong> hanya untuk angka yang memang terukur nol.
        </p>
        {metrics.length === 0 ? (
          <p className="mt-3">
            Belum ada metrik aktif untuk platform ini. Aktifkan atau buat di{' '}
            <Link href="/settings/metrics" className="text-primary underline">
              Pengaturan → Metrik
            </Link>
            .
          </p>
        ) : (
          metrics.map((m) => (
            <MetricRow
              key={`${m.id}-${state.values[`mode__${m.id}`] ?? ''}`}
              metric={m}
              state={state}
              initialValues={initialValues}
            />
          ))
        )}
      </fieldset>

      {needsConfirm ? (
        <div className="card space-y-3 border-warning">
          <Alert tone="warning" title="Tinjau peringatan" live="alert">
            <ul className="list-disc space-y-1 pl-5">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
          <div className="flex items-start gap-3">
            <input id="confirmWarnings" name="confirmWarnings" type="checkbox" required className="mt-1 size-5 accent-primary" />
            <label htmlFor="confirmWarnings" className="text-sm font-semibold">
              Saya sudah meninjau peringatan di atas dan tetap ingin menyimpan snapshot ini.
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton>{needsConfirm ? 'Simpan dengan peringatan' : 'Simpan snapshot'}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}
