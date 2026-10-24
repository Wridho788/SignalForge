import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { cancelRestoreAction, confirmRestoreAction } from '@/features/data/actions';
import { ConfirmRestoreForm } from '@/features/data/forms';
import { InlineActionForm } from '@/features/experiments/forms';
import { resolveDataDir } from '@/lib/config';
import { getDb } from '@/lib/db/connection';
import { readStagedCounts } from '@/lib/services/backup';
import { getOverviewStats } from '@/lib/services/overview';

export const metadata = { title: 'Konfirmasi pemulihan' };

export default async function ConfirmRestorePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const incoming = readStagedCounts(resolveDataDir(), token);
  if (!incoming) notFound();
  const current = getOverviewStats(getDb());

  const rows: [string, number, number][] = [
    ['Episode', current.episodes, incoming.episodes],
    ['Distribusi', current.distributions, incoming.distributions],
    ['Snapshot', current.snapshots, incoming.snapshots],
  ];

  return (
    <>
      <Breadcrumbs items={[{ href: '/imports/backup', label: 'Cadangan & pemulihan' }, { label: 'Konfirmasi' }]} />
      <PageHeader title="Konfirmasi pemulihan" description="File cadangan lolos pemeriksaan. Tinjau perbedaannya sebelum melanjutkan." />

      <div className="card mb-6">
        <table className="data-table">
          <caption className="sr-only">Perbandingan data saat ini dan isi cadangan.</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col" className="num">Saat ini (akan diganti)</th>
              <th scope="col" className="num">Dari cadangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, now, then]) => (
              <tr key={label}>
                <th scope="row" className="!bg-transparent font-normal">{label}</th>
                <td className="num">{now}</td>
                <td className="num">{then}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="!bg-transparent font-normal">Eksperimen</th>
              <td className="num">{current.runningExperiments.length} berjalan</td>
              <td className="num">{incoming.experiments} total</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-6">
        <Alert tone="danger" title="Tindakan ini mengganti seluruh data">
          Setelah dipulihkan, episode, snapshot, eksperimen, dan pengaturan saat ini diganti isi cadangan. Cadangan pra-pemulihan dari data saat ini dibuat otomatis dan bisa diunduh dari daftar cadangan.
        </Alert>
      </div>

      <div className="card space-y-4">
        <ConfirmRestoreForm action={confirmRestoreAction.bind(null, token)} />
        <InlineActionForm action={cancelRestoreAction.bind(null, token)} submitLabel="Batal" variant="secondary" />
      </div>
    </>
  );
}
