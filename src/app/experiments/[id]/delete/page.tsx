import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { deleteExperimentAction } from '@/features/experiments/actions';
import { InlineActionForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import { orNotFound } from '@/lib/page-helpers';
import { getExperimentDetail } from '@/lib/services/experiments';

export const metadata = { title: 'Hapus eksperimen' };

export default async function DeleteExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const { experiment: x, links, events } = orNotFound(() => getExperimentDetail(getDb(), id));
  if (x.status !== 'draft' && x.status !== 'cancelled') notFound();

  return (
    <>
      <Breadcrumbs items={[{ href: '/experiments', label: 'Eksperimen' }, { href: `/experiments/${id}`, label: x.title }, { label: 'Hapus' }]} />
      <PageHeader title="Hapus eksperimen?" />
      <div className="card space-y-4">
        <Alert tone="danger" title="Tindakan ini permanen">
          Eksperimen <strong>{x.title}</strong> akan dihapus bersama {links.length} tautan dan {events.length} entri log. Episode, distribusi, dan snapshot
          yang ditautkan <strong>tidak</strong> ikut terhapus.
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <InlineActionForm action={deleteExperimentAction.bind(null, id)} submitLabel="Ya, hapus permanen" variant="danger" pendingLabel="Menghapus…" />
          <Link href={`/experiments/${id}`} className="btn btn-secondary">
            Batal
          </Link>
        </div>
      </div>
    </>
  );
}
