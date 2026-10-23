import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { updateDistributionAction } from '@/features/distributions/actions';
import { DistributionForm } from '@/features/distributions/DistributionForm';
import { getDb } from '@/lib/db/connection';
import { PLATFORM_IDS } from '@/lib/domain/types';
import { orNotFound } from '@/lib/page-helpers';
import { getDistribution, previewDistributionDelete } from '@/lib/services/distributions';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import { isoToLocalInput } from '@/lib/time';

export const metadata = { title: 'Ubah distribusi' };

const PLATFORM_NAMES: Record<(typeof PLATFORM_IDS)[number], string> = {
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export default async function EditDistributionPage({
  params,
}: {
  params: Promise<{ id: string; distId: string }>;
}) {
  await connection();
  const { id, distId } = await params;
  const db = getDb();
  const d = orNotFound(() => getDistribution(db, distId));
  if (d.episodeId !== id) notFound();
  const { episode } = orNotFound(() => getEpisodeDetail(db, id));
  const { timezone } = getAppSettings(db);

  return (
    <>
      <Breadcrumbs
        items={[
          { href: '/episodes', label: 'Episode' },
          { href: `/episodes/${id}`, label: episode.title },
          { href: `/episodes/${id}/distributions/${distId}`, label: d.platformName },
          { label: 'Ubah' },
        ]}
      />
      <PageHeader title="Ubah distribusi" />
      <DistributionForm
        action={updateDistributionAction.bind(null, id, distId)}
        initial={{
          platformId: d.platformId,
          status: d.status,
          postUrl: d.postUrl ?? '',
          publishedAtLocal: d.publishedAt ? isoToLocalInput(d.publishedAt, timezone) : '',
          externalPostId: d.externalPostId ?? '',
          variantLabel: d.variantLabel ?? '',
        }}
        platforms={PLATFORM_IDS.map((p) => ({ id: p, name: PLATFORM_NAMES[p] }))}
        timezone={timezone}
        platformLocked={previewDistributionDelete(db, distId).snapshotCount > 0}
        submitLabel="Simpan perubahan"
        cancelHref={`/episodes/${id}/distributions/${distId}`}
      />
    </>
  );
}
