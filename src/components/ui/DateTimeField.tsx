'use client';

import { useId, useState } from 'react';
import { localInputToUtcIso, utcOffsetLabel } from '@/lib/time';

/**
 * `datetime-local` input with an explicit time zone and a live preview of how the text is parsed
 * (DESIGN_SYSTEM → Forms). Remount with a new `key` when the server echoes new default values.
 */
export function DateTimeField({
  name,
  label,
  timezone,
  defaultValue = '',
  error,
  hint,
  required,
  blankMeaning,
}: {
  name: string;
  label: string;
  timezone: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Shown when the field is empty, e.g. what "unknown" means for this field. */
  blankMeaning?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const previewId = useId();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;

  let preview: string;
  if (value.trim() === '') {
    preview = blankMeaning ?? 'Kosong.';
  } else {
    const utc = localInputToUtcIso(value, timezone);
    preview = utc
      ? `Dibaca sebagai ${value.replace('T', ' ')} ${timezone} (${utcOffsetLabel(timezone, Date.parse(utc))}) = ${utc} UTC.`
      : `Waktu tidak valid atau tidak ada di zona waktu ${timezone}.`;
  }

  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (wajib)</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, previewId, error ? errorId : null].filter(Boolean).join(' ')}
        className="input"
      />
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      <p id={previewId} aria-live="polite" className="field-hint">
        {preview}
      </p>
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
