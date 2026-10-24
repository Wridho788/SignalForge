import { z } from 'zod';
import { DECISIONS, DESIGNS, ROLES, SUCCESS_TYPES } from '../experiments/model';
import { requiredText, optionalText } from './common';

export const experimentInputSchema = z.object({
  title: requiredText('Judul', 200),
  hypothesis: requiredText('Hipotesis', 2000),
  rationale: optionalText('Rasional', 3000),
  variableToTest: requiredText('Variabel yang diuji', 500),
  targetAudience: optionalText('Target audiens', 500),
  design: z.enum(DESIGNS, { error: 'Pilih desain perbandingan.' }),
  primaryMetricId: z.string({ error: 'Pilih metrik utama.' }).trim().min(1, 'Pilih metrik utama.').max(80),
  windowHours: z.preprocess(
    (v) => (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : v),
    z.number({ error: 'Pilih jendela usia perbandingan.' }).int().min(1).max(8760),
  ),
  successType: z.enum(SUCCESS_TYPES, { error: 'Pilih jenis kriteria sukses.' }),
  /** Raw text; parsed against the primary metric by the service (units differ per metric). */
  successValue: z.string({ error: 'Isi nilai ambang sukses.' }).trim().min(1, 'Isi nilai ambang sukses.').max(30),
});

export type ExperimentInput = z.output<typeof experimentInputSchema> & { secondaryMetricIds: string[] };

export const outcomeSchema = z.object({
  decision: z.enum(DECISIONS, { error: 'Pilih keputusan.' }),
  learning: requiredText('Pembelajaran', 5000),
});
export type OutcomeInput = z.output<typeof outcomeSchema>;

export const noteSchema = z.object({ note: requiredText('Catatan', 2000) });

export const linkSchema = z.object({
  distributionId: z.string({ error: 'Pilih distribusi.' }).trim().min(1, 'Pilih distribusi.').max(80),
  role: z.enum(ROLES, { error: 'Pilih peran.' }),
});
export type LinkInput = z.output<typeof linkSchema>;
