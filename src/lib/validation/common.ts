import { z } from 'zod';

/** First message per top-level field, keyed by field name. */
export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : { ok: false, fieldErrors: toFieldErrors(result.error) };
}

/** Flattens FormData to plain strings (drops React's `$ACTION_*` fields and File entries). */
export function formDataToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION_') || typeof value !== 'string') continue;
    out[key] = value;
  }
  return out;
}

/** Missing or blank optional input is "unknown" (null) — never an empty string and never 0. */
export const blankToNull = (v: unknown) =>
  v === undefined || v === null ? null : typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;

const hasControlChars = (s: string) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export function optionalText(label: string, max: number) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .max(max, `${label} maksimal ${max} karakter.`)
      .refine((s) => !hasControlChars(s), `${label} mengandung karakter yang tidak diizinkan.`)
      .nullable(),
  );
}

export function requiredText(label: string, max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z
      .string({ error: `${label} wajib diisi.` })
      .min(1, `${label} wajib diisi.`)
      .max(max, `${label} maksimal ${max} karakter.`)
      .refine((s) => !hasControlChars(s), `${label} mengandung karakter yang tidak diizinkan.`),
  );
}

/** Accepts "90" (seconds) or "1:30" (mm:ss). Blank → null. */
export function parseDurationSeconds(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (/^\d{1,6}$/.test(text)) return Number(text);
  const m = /^(\d{1,4}):([0-5]\d)$/.exec(text);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return 'invalid';
}

export const MAX_DURATION_SECONDS = 24 * 3600;

export function durationField(label: string) {
  return z.preprocess(
    (v) => (v === undefined || v === null ? null : typeof v === 'string' ? parseDurationSeconds(v) : v),
    z
      .union([z.number().int().min(0).max(MAX_DURATION_SECONDS), z.null()], {
        error: `${label} harus berupa detik (mis. 90) atau mm:ss (mis. 1:30), maksimal 24 jam.`,
      }),
  );
}

export function parseHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function optionalHttpUrl(label: string) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .max(2000, `${label} maksimal 2000 karakter.`)
      .refine((s) => parseHttpUrl(s) !== null, `${label} harus berupa URL http:// atau https:// yang valid.`)
      .nullable(),
  );
}

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** Splits "a, b ,A" → ['a','b'] (trimmed, whitespace-collapsed, case-insensitive de-duplicated). */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function tagsField() {
  return z.preprocess(
    (v) => (typeof v === 'string' ? parseTags(v) : v ?? []),
    z
      .array(
        z
          .string()
          .max(MAX_TAG_LENGTH, `Setiap tag maksimal ${MAX_TAG_LENGTH} karakter.`)
          .refine((s) => !hasControlChars(s), 'Tag mengandung karakter yang tidak diizinkan.'),
      )
      .max(MAX_TAGS, `Maksimal ${MAX_TAGS} tag.`),
  );
}
