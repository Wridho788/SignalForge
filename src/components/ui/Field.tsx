import type { ReactNode } from 'react';

interface BaseProps {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
}

function describedBy(name: string, hint: ReactNode, error?: string): string | undefined {
  const ids = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function FieldShell({ name, label, hint, error, required, children }: BaseProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (wajib)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${name}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  error,
  required,
  defaultValue,
  type = 'text',
  inputMode,
  autoComplete = 'off',
  list,
  placeholder,
  maxLength,
}: BaseProps & {
  defaultValue?: string;
  type?: 'text' | 'url' | 'datetime-local' | 'search';
  inputMode?: 'text' | 'decimal' | 'numeric';
  autoComplete?: string;
  list?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error} required={required}>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        list={list}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        className="input"
      />
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  error,
  required,
  defaultValue,
  rows = 4,
  maxLength,
}: BaseProps & { defaultValue?: string; rows?: number; maxLength?: number }) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        className="input"
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  error,
  required,
  defaultValue,
  options,
  disabled,
}: BaseProps & {
  defaultValue?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error} required={required}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        className="input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-1 size-5 accent-primary"
      />
      <div>
        <label htmlFor={name} className="text-sm font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${name}-hint`} className="field-hint mt-0">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
