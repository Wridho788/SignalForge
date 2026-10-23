import { connection } from 'next/server';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { createDistributionAction } from '@/features/distributions/actions';
import { DistributionForm } from '@/features/distributions/DistributionForm';
import { getDb } from '@/lib/db/connection';
import { orNotFound } from '@/lib/page-helpers';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import { PLATFORM_IDS } from '@/lib/domain/types';

export const metadata = { title: 'Tambah distribusi' };

const PLATFORM_NAMES: Record<(typeof PLATFORM_IDS)[number], string> = {
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export default async function NewDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const { episode, distributions } = orNotFound(() => getEpisodeDetail(db, id));
  const { timezone } = getAppSettings(db);
  const firstFree = PLATFORM_IDS.find((p) => !distributions.some((d) => d.platformId === p)) ?? 'youtube';

  return (
    <>
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { href: `/episodes/${id}`, label: episode.title }, { label: 'Tambah distribusi' }]} />
      <PageHeader title="Tambah distribusi" description="Satu distribusi mewakili satu post di satu platform." />
      <DistributionForm
        action={createDistributionAction.bind(null, id)}
        initial={{ platformId: firstFree, status: 'published' }}
        platforms={PLATFORM_IDS.map((p) => ({ id: p, name: PLATFORM_NAMES[p] }))}
        timezone={timezone}
        platformLocked={false}
        submitLabel="Tambah distribusi"
        cancelHref={`/episodes/${id}`}
      />
    </>
  );
}
