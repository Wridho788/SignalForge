import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Alert } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { updateExperimentAction } from '@/features/experiments/actions';
import { ExperimentForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import { isDefinitionEditable } from '@/lib/experiments/model';
import { orNotFound } from '@/lib/page-helpers';
import { listAnalyticsMetrics } from '@/lib/services/analytics';
import { getExperimentDetail } from '@/lib/services/experiments';
import { getAppSettings } from '@/lib/services/settings';

export const metadata = { title: 'Ubah eksperimen' };

export default async function EditExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = getDb();
  const detail = orNotFound(() => getExperimentDetail(db, id));
  const { experiment: x, secondaryMetrics } = detail;
  if (!isDefinitionEditable(x.status)) notFound();
  const metrics = listAnalyticsMetrics(db);
  const { comparisonWindows } = getAppSettings(db);

  // Success value back in the unit the user typed: relative gain as %, ratio min_value as %.
  const successValue =
    x.successType === 'min_relative_gain'
      ? String(Number((x.successValue * 100).toFixed(4))).replace('.', ',')
      : detail.metric.aggregationKind === 'ratio'
        ? String(Number((x.successValue * 100).toFixed(4))).replace('.', ',')
        : String(x.successValue);

  const initial: Record<string, string> = {
    title: x.title,
    hypothesis: x.hypothesis,
    rationale: x.rationale ?? '',
    variableToTest: x.variableToTest,
    targetAudience: x.targetAudience ?? '',
    design: x.design,
    primaryMetricId: x.primaryMetricId,
    windowHours: String(x.windowHours),
    successType: x.successType,
    successValue,
  };
  for (const m of secondaryMetrics) initial[`secondary__${m.id}`] = 'on';

  return (
    <>
      <Breadcrumbs items={[{ href: '/experiments', label: 'Eksperimen' }, { href: `/experiments/${id}`, label: x.title }, { label: 'Ubah' }]} />
      <PageHeader title="Ubah eksperimen" />
      <div className="mb-4">
        <Alert tone="info">Definisi hanya bisa diubah saat Draf atau Direncanakan; setelah berjalan, hipotesis dan kriteria sukses dikunci.</Alert>
      </div>
      <ExperimentForm
        action={updateExperimentAction.bind(null, id)}
        initial={initial}
        metrics={metrics.map((m) => ({ id: m.id, label: m.label, unit: m.unit, platformName: m.platformName }))}
        windows={comparisonWindows}
        submitLabel="Simpan perubahan"
        cancelHref={`/experiments/${id}`}
      />
    </>
  );
}
