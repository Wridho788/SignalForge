import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteDistributionAction } from '@/features/distributions/actions';
import { getDb } from '@/lib/db/connection';
import { orNotFound } from '@/lib/page-helpers';
import { previewDistributionDelete } from '@/lib/services/distributions';

export const metadata = { title: 'Hapus distribusi' };

export default async function DeleteDistributionPage({
  params,
}: {
  params: Promise<{ id: string; distId: string }>;
}) {
  await connection();
  const { id, distId } = await params;
  const preview = orNotFound(() => previewDistributionDelete(getDb(), distId));
  if (preview.episodeId !== id) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { href: '/episodes', label: 'Episode' },
          { href: `/episodes/${id}`, label: 'Episode' },
          { href: `/episodes/${id}/distributions/${distId}`, label: preview.label },
          { label: 'Hapus' },
        ]}
      />
      <PageHeader title="Hapus distribusi?" />
      <div className="card space-y-4">
        <Alert tone="danger" title="Tindakan ini permanen">
          Distribusi <strong>{preview.label}</strong> akan dihapus bersama {preview.snapshotCount} snapshot metrik.
          Snapshot adalah bukti historis dan tidak bisa dipulihkan dari aplikasi. Jika post hanya tidak aktif lagi,
          ubah statusnya menjadi <em>Diarsipkan</em> sebagai gantinya.
        </Alert>
        <form action={deleteDistributionAction.bind(null, id, distId)} className="flex flex-wrap gap-3">
          <SubmitButton variant="danger" pendingLabel="Menghapus…">
            Ya, hapus permanen
          </SubmitButton>
          <Link href={`/episodes/${id}/distributions/${distId}`} className="btn btn-secondary">
            Batal
          </Link>
        </form>
      </div>
    </>
  );
}
