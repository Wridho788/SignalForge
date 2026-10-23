import { connection } from 'next/server';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { updateMetricAction } from '@/features/settings/actions';
import { MetricEditForm } from '@/features/settings/MetricForms';
import { getDb } from '@/lib/db/connection';
import { AGGREGATION_KIND_LABELS } from '@/lib/domain/types';
import { orNotFound } from '@/lib/page-helpers';
import { getMetricDefinition } from '@/lib/services/metric-definitions';

export const metadata = { title: 'Ubah metrik' };

export default async function EditMetricPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const m = orNotFound(() => getMetricDefinition(getDb(), id));

  return (
    <>
      <Breadcrumbs items={[{ href: '/settings/metrics', label: 'Metrik' }, { label: m.label }]} />
      <PageHeader
        title={`Ubah metrik: ${m.label}`}
        description={`Kunci ${m.key} · ${AGGREGATION_KIND_LABELS[m.aggregationKind]} · satuan ${m.unit} · ${
          m.platformName ?? 'semua platform'
        } · ${m.valueCount} nilai tercatat. Bidang ini tidak bisa diubah agar nilai lama tetap bermakna.`}
      />
      <MetricEditForm
        action={updateMetricAction.bind(null, id)}
        initial={{
          label: m.label,
          description: m.description ?? '',
          sourceDefinition: m.sourceDefinition ?? '',
          formulaVersion: m.formulaVersion ?? '',
          isActive: m.isActive ? 'on' : '',
        }}
      />
    </>
  );
}
