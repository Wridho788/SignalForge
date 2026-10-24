import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { createExperimentAction } from '@/features/experiments/actions';
import { ExperimentForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import { listAnalyticsMetrics } from '@/lib/services/analytics';
import { getAppSettings } from '@/lib/services/settings';

export const metadata = { title: 'Eksperimen baru' };

export default async function NewExperimentPage() {
  await connection();
  const db = getDb();
  const metrics = listAnalyticsMetrics(db);
  const { comparisonWindows } = getAppSettings(db);
  const views = metrics.find((m) => m.key === 'views') ?? metrics[0];

  return (
    <>
      <Breadcrumbs items={[{ href: '/experiments', label: 'Eksperimen' }, { label: 'Baru' }]} />
      <PageHeader title="Eksperimen baru" description="Tetapkan hipotesis dan kriteria sukses sebelum melihat hasil. Definisi dikunci begitu eksperimen berjalan." />
      {metrics.length === 0 ? (
        <Alert tone="warning" title="Belum ada metrik numerik aktif">
          Aktifkan atau buat metrik di Pengaturan → Metrik.
        </Alert>
      ) : (
        <ExperimentForm
          action={createExperimentAction}
          initial={{ design: 'concurrent', successType: 'min_relative_gain', primaryMetricId: views?.id ?? '', windowHours: String(comparisonWindows[0]?.hours ?? '') }}
          metrics={metrics.map((m) => ({ id: m.id, label: m.label, unit: m.unit, platformName: m.platformName }))}
          windows={comparisonWindows}
          submitLabel="Buat eksperimen"
          cancelHref="/experiments"
        />
      )}
    </>
  );
}
