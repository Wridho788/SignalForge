import { z } from 'zod';
import { isValidTimeZone } from '../time';
import { MAX_COMPARISON_WINDOWS } from './settings-limits';

export { MAX_COMPARISON_WINDOWS };

export const comparisonWindowSchema = z
  .object({
    hours: z.number().int().min(1).max(8760),
    toleranceHours: z.number().int().min(0).max(8760),
  })
  .refine((w) => w.toleranceHours <= w.hours, 'Toleransi tidak boleh lebih besar dari jendela.');

export type ComparisonWindow = z.output<typeof comparisonWindowSchema>;

export const DEFAULT_COMPARISON_WINDOWS: ComparisonWindow[] = [
  { hours: 24, toleranceHours: 6 },
  { hours: 168, toleranceHours: 24 },
];

export const comparisonWindowsSchema = z
  .array(comparisonWindowSchema)
  .min(1, 'Minimal satu jendela perbandingan.')
  .max(MAX_COMPARISON_WINDOWS, `Maksimal ${MAX_COMPARISON_WINDOWS} jendela.`)
  .refine((ws) => new Set(ws.map((w) => w.hours)).size === ws.length, 'Jendela tidak boleh duplikat.');

export const timezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimeZone, 'Zona waktu tidak dikenal (gunakan nama IANA, mis. Asia/Jakarta).');

export interface AppSettings {
  timezone: string;
  comparisonWindows: ComparisonWindow[];
}
