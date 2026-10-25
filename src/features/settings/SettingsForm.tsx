'use client';

import { useActionState } from 'react';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleState, type FormState } from '@/lib/form-state';
import { MAX_COMPARISON_WINDOWS } from '@/lib/validation/settings-limits';

export function SettingsForm({
  action,
  timezone,
  timezones,
  windows,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  timezone: string;
  timezones: string[];
  windows: { hours: number; toleranceHours: number }[];
}) {
  const [state, formAction] = useActionState(action, idleState);
  const tz = state.values.timezone ?? timezone;
  const rows = Array.from({ length: MAX_COMPARISON_WINDOWS }, (_, i) => ({
    hours: state.values[`window_hours_${i}`] ?? (windows[i] ? String(windows[i]!.hours) : ''),
    tolerance: state.values[`window_tolerance_${i}`] ?? (windows[i] ? String(windows[i]!.toleranceHours) : ''),
  }));

  return (
    <form action={formAction} className="card space-y-6" noValidate>
      <FormErrors state={state} />

      <div>
        <label htmlFor="timezone" className="field-label">
          Zona waktu <span aria-hidden="true">*</span>
          <span className="sr-only"> (wajib)</span>
        </label>
        <input
          id="timezone"
          name="timezone"
          list="timezone-list"
          defaultValue={tz}
          autoComplete="off"
          aria-invalid={state.fieldErrors.timezone ? true : undefined}
          aria-describedby={['timezone-hint', state.fieldErrors.timezone ? 'timezone-error' : null].filter(Boolean).join(' ')}
          className="input max-w-md"
        />
        <datalist id="timezone-list">
          {timezones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p id="timezone-hint" className="field-hint">
          Nama IANA (mis. Asia/Jakarta, Asia/Taipei). Waktu disimpan dalam UTC dan ditampilkan/dibaca di zona ini.
        </p>
        {state.fieldErrors.timezone ? (
          <p id="timezone-error" className="field-error">
            {state.fieldErrors.timezone}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="field-label">Jendela perbandingan usia post</legend>
        <p className="field-hint mt-0">
          Dipakai untuk membandingkan post pada usia yang setara (mis. 24 jam). Snapshot dianggap cocok jika usianya
          dalam toleransi ± dari target. Isi sampai {MAX_COMPARISON_WINDOWS} baris; baris kosong diabaikan.
        </p>
        {state.fieldErrors.comparisonWindows ? (
          <p className="field-error" role="alert">
            {state.fieldErrors.comparisonWindows}
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid max-w-xl grid-cols-2 gap-3">
              <div>
                <label htmlFor={`window_hours_${i}`} className="field-label">
                  Target usia (jam) #{i + 1}
                </label>
                <input
                  id={`window_hours_${i}`}
                  name={`window_hours_${i}`}
                  inputMode="numeric"
                  defaultValue={row.hours}
                  aria-invalid={state.fieldErrors[`window_hours_${i}`] ? true : undefined}
                  className="input"
                />
                {state.fieldErrors[`window_hours_${i}`] ? (
                  <p className="field-error">{state.fieldErrors[`window_hours_${i}`]}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor={`window_tolerance_${i}`} className="field-label">
                  Toleransi ± (jam) #{i + 1}
                </label>
                <input
                  id={`window_tolerance_${i}`}
                  name={`window_tolerance_${i}`}
                  inputMode="numeric"
                  defaultValue={row.tolerance}
                  aria-invalid={state.fieldErrors[`window_tolerance_${i}`] ? true : undefined}
                  className="input"
                />
                {state.fieldErrors[`window_tolerance_${i}`] ? (
                  <p className="field-error">{state.fieldErrors[`window_tolerance_${i}`]}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <SubmitButton>Simpan pengaturan</SubmitButton>
    </form>
  );
}
