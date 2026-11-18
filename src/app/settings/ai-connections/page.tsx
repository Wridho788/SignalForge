import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout-bits';
import { snapshotsForPage } from '@/features/ai/snapshots';
import { ProviderCard } from '@/features/ai/ProviderCard';
import { getDb } from '@/lib/db/connection';
import { getAppSettings } from '@/lib/services/settings';

export const metadata = { title: 'Koneksi AI' };

export default async function AiConnectionsPage() {
  await connection();
  const timezone = getAppSettings(getDb()).timezone;
  const snapshots = await snapshotsForPage();
  const testMode = snapshots.some((s) => s.testMode);
  return (
    <>
      <PageHeader
        title="Koneksi AI"
        description="Hubungkan asisten AI opsional untuk menganalisis data dasbor yang Anda pilih. Dasbor tetap berfungsi penuh tanpa AI."
      />
      <div className="mb-4 space-y-3">
        <Alert tone="info" title="Cara kerja koneksi">
          Claude dan Codex memakai alur resmi lokal masing-masing. Gemini memakai Gemini API dengan key sementara dari environment OS. SignalForge tidak pernah menampilkan, meminta, atau menyimpan token/key, dan tidak ada kolom kredensial.
        </Alert>
        {testMode ? (
          <Alert tone="warning" title="Mode uji">
            SIGNALFORGE_AI_MODE=fake: penyedia di halaman ini palsu dan tidak menghubungi layanan apa pun.
          </Alert>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {snapshots.map((s) => (
          <ProviderCard key={s.provider} initial={s} timezone={timezone} />
        ))}
      </div>
    </>
  );
}
