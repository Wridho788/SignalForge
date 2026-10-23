import path from 'node:path';
import { connection } from 'next/server';
import { Notice } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout-bits';
import { saveSettingsAction } from '@/features/settings/actions';
import { SettingsForm } from '@/features/settings/SettingsForm';
import { DATABASE_FILE_NAME, resolveDataDir } from '@/lib/config';
import { getDb } from '@/lib/db/connection';
import { type SearchParams } from '@/lib/page-helpers';
import { getAppSettings } from '@/lib/services/settings';
import { DEFAULT_TIMEZONE } from '@/lib/time';

export const metadata = { title: 'Pengaturan' };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const settings = getAppSettings(getDb());
  const timezones = Intl.supportedValuesOf('timeZone');
  if (!timezones.includes(DEFAULT_TIMEZONE)) timezones.push(DEFAULT_TIMEZONE);
  const dataDir = resolveDataDir();

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader title="Pengaturan" description="Preferensi lokal. Tidak ada kredensial atau token yang disimpan di sini." />
      <SettingsForm
        action={saveSettingsAction}
        timezone={settings.timezone}
        timezones={timezones}
        windows={settings.comparisonWindows}
      />

      <section aria-labelledby="data-heading" className="card mt-6">
        <h2 id="data-heading" className="text-lg font-semibold">
          Lokasi data
        </h2>
        <p className="mt-1 text-sm text-muted">
          Database SQLite tersimpan lokal di komputer ini, di luar folder publik. Cadangan otomatis sebelum migrasi
          skema ditulis ke folder <code>backups</code> di sebelahnya. Server hanya menerima koneksi dari 127.0.0.1.
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-muted">Folder data</dt>
            <dd className="break-all font-mono">{dataDir}</dd>
          </div>
          <div>
            <dt className="text-muted">File database</dt>
            <dd className="break-all font-mono">{path.join(dataDir, DATABASE_FILE_NAME)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
