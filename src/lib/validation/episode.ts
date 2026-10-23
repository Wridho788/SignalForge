import { z } from 'zod';
import { blankToNull, durationField, optionalText, requiredText, tagsField } from './common';

const EPISODE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

export const episodeInputSchema = z.object({
  title: requiredText('Judul', 200),
  workingTitle: optionalText('Judul kerja', 200),
  episodeCode: z.preprocess(
    blankToNull,
    z
      .string()
      .regex(EPISODE_CODE_RE, 'Kode episode: huruf/angka, boleh . _ -, maksimal 32 karakter.')
      .nullable(),
  ),
  premise: optionalText('Premis', 2000),
  format: optionalText('Format', 80),
  durationSeconds: durationField('Durasi'),
  scriptText: optionalText('Naskah', 50000),
  notes: optionalText('Catatan', 5000),
  tags: tagsField(),
});

export type EpisodeInput = z.output<typeof episodeInputSchema>;
