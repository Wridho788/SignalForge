import Link from 'next/link';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteEpisodeAction } from '@/features/episodes/actions';
import { getDb } from '@/lib/db/connection';
import { orNotFound } from '@/lib/page-helpers';
import { previewEpisodeDelete } from '@/lib/services/episodes';

export const metadata = { title: 'Hapus episode' };

export default async function DeleteEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const preview = orNotFound(() => previewEpisodeDelete(getDb(), id));

  return (
    <>
      <Breadcrumbs items={[{ href: '/episodes', label: 'Episode' }, { href: `/episodes/${id}`, label: preview.title }, { label: 'Hapus' }]} />
      <PageHeader title="Hapus episode?" />
      <div className="card space-y-4">
        <Alert tone="danger" title="Tindakan ini permanen">
          Episode <strong>{preview.title}</strong> akan dihapus bersama {preview.distributionCount} distribusi dan{' '}
          {preview.snapshotCount} snapshot metrik. Snapshot adalah bukti historis dan tidak bisa dipulihkan dari aplikasi.
          Pertimbangkan membuat cadangan atau mengarsipkan distribusi sebagai gantinya.
        </Alert>
        <form action={deleteEpisodeAction.bind(null, id)} className="flex flex-wrap gap-3">
          <SubmitButton variant="danger" pendingLabel="Menghapus…">
            Ya, hapus permanen
          </SubmitButton>
          <Link href={`/episodes/${id}`} className="btn btn-secondary">
            Batal
          </Link>
        </form>
      </div>
    </>
  );
}
