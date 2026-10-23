import { connection } from 'next/server';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { createEpisodeAction } from '@/features/episodes/actions';
import { EpisodeForm } from '@/features/episodes/EpisodeForm';
import { getDb } from '@/lib/db/connection';
import { listTags } from '@/lib/services/episodes';

export const metadata = { title: 'Episode baru' };

export default async function NewEpisodePage() {
  await connection();
  const tagSuggestions = listTags(getDb()).map((t) => t.name);
  return (
    <>
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { label: 'Baru' }]} />
      <PageHeader title="Episode baru" />
      <EpisodeForm
        action={createEpisodeAction}
        initial={{}}
        tagSuggestions={tagSuggestions}
        submitLabel="Buat episode"
        cancelHref="/episodes"
      />
    </>
  );
}
