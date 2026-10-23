import { connection } from 'next/server';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { updateEpisodeAction } from '@/features/episodes/actions';
import { EpisodeForm } from '@/features/episodes/EpisodeForm';
import { getDb } from '@/lib/db/connection';
import { orNotFound } from '@/lib/page-helpers';
import { getEpisodeDetail, listTags } from '@/lib/services/episodes';

export const metadata = { title: 'Ubah episode' };

export default async function EditEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const { episode, tags } = orNotFound(() => getEpisodeDetail(db, id));
  const tagSuggestions = listTags(db).map((t) => t.name);

  const initial: Record<string, string> = {
    title: episode.title,
    workingTitle: episode.workingTitle ?? '',
    episodeCode: episode.episodeCode ?? '',
    format: episode.format ?? '',
    durationSeconds: episode.durationSeconds === null ? '' : String(episode.durationSeconds),
    premise: episode.premise ?? '',
    scriptText: episode.scriptText ?? '',
    notes: episode.notes ?? '',
    tags: tags.join(', '),
  };

  return (
    <>
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { href: `/episodes/${id}`, label: episode.title }, { label: 'Ubah' }]} />
      <PageHeader title="Ubah episode" />
      <EpisodeForm
        action={updateEpisodeAction.bind(null, id)}
        initial={initial}
        tagSuggestions={tagSuggestions}
        submitLabel="Simpan perubahan"
        cancelHref={`/episodes/${id}`}
      />
    </>
  );
}
