import { z } from 'zod';
import { AGGREGATION_KINDS, PLATFORM_IDS } from '../domain/types';
import { blankToNull, optionalText, requiredText } from './common';

const checkbox = (v: unknown) => v === 'on' || v === 'true' || v === '1' || v === true;

export const metricDefinitionCreateSchema = z
  .object({
    key: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z
        .string({ error: 'Kunci wajib diisi.' })
        .regex(/^[a-z][a-z0-9_]{0,59}$/, 'Kunci: huruf kecil, angka, garis bawah; diawali huruf; maksimal 60 karakter.'),
    ),
    label: requiredText('Label', 80),
    unit: requiredText('Satuan', 40),
    description: optionalText('Deskripsi', 500),
    aggregationKind: z.enum(AGGREGATION_KINDS, { error: 'Pilih jenis metrik.' }),
    currencyCode: z.preprocess(
      (v) => {
        const t = blankToNull(v);
        return typeof t === 'string' ? t.toUpperCase() : t;
      },
      z
        .string()
        .regex(/^[A-Z]{3}$/, 'Kode mata uang 3 huruf (mis. IDR, USD).')
        .nullable(),
    ),
    platformId: z.preprocess(blankToNull, z.enum(PLATFORM_IDS, { error: 'Platform tidak valid.' }).nullable()),
    allowNegative: z.preprocess(checkbox, z.boolean()),
    sourceDefinition: optionalText('Definisi sumber', 1000),
    formulaVersion: optionalText('Versi formula', 40),
  })
  .superRefine((v, ctx) => {
    if (v.aggregationKind === 'currency' && !v.currencyCode) {
      ctx.addIssue({ code: 'custom', path: ['currencyCode'], message: 'Kode mata uang wajib untuk metrik mata uang.' });
    }
    if (v.aggregationKind !== 'currency' && v.currencyCode) {
      ctx.addIssue({ code: 'custom', path: ['currencyCode'], message: 'Kode mata uang hanya untuk metrik mata uang.' });
    }
  });

export type MetricDefinitionCreateInput = z.output<typeof metricDefinitionCreateSchema>;

export const metricDefinitionUpdateSchema = z.object({
  label: requiredText('Label', 80),
  description: optionalText('Deskripsi', 500),
  sourceDefinition: optionalText('Definisi sumber', 1000),
  formulaVersion: optionalText('Versi formula', 40),
  isActive: z.preprocess(checkbox, z.boolean()),
});

export type MetricDefinitionUpdateInput = z.output<typeof metricDefinitionUpdateSchema>;
