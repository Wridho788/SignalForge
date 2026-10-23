import { createMetricAction } from '@/features/settings/actions';
import { MetricCreateForm } from '@/features/settings/MetricForms';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { PLATFORM_IDS } from '@/lib/domain/types';

export const metadata = { title: 'Metrik baru' };

const PLATFORMS = PLATFORM_IDS.map((id) => ({ id, name: { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }[id] }));

export default function NewMetricPage() {
  return (
    <>
      <Breadcrumbs items={[{ href: '/settings/metrics', label: 'Metrik' }, { label: 'Baru' }]} />
      <PageHeader title="Metrik baru" />
      <MetricCreateForm action={createMetricAction} platforms={PLATFORMS} />
    </>
  );
}
