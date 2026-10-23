import { z } from 'zod';
import { DISTRIBUTION_STATUSES, PLATFORM_IDS } from '../domain/types';
import { blankToNull, optionalHttpUrl, optionalText } from './common';

export const distributionInputSchema = z.object({
  platformId: z.enum(PLATFORM_IDS, { error: 'Pilih platform Facebook, YouTube, atau TikTok.' }),
  status: z.enum(DISTRIBUTION_STATUSES, { error: 'Status tidak valid.' }),
  postUrl: optionalHttpUrl('URL post'),
  /** `datetime-local` text in the user's time zone, or null. Converted to UTC by the service. */
  publishedAtLocal: z.preprocess(blankToNull, z.string().max(32).nullable()),
  externalPostId: optionalText('ID post eksternal', 100),
  variantLabel: optionalText('Label varian', 60),
});

export type DistributionInput = z.output<typeof distributionInputSchema>;
