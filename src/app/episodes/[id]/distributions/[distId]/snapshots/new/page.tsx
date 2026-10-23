import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { recordSnapshotAction } from '@/features/snapshots/actions';
import { SnapshotForm, type SnapshotMetricView } from '@/features/snapshots/SnapshotForm';
import { getDb } from '@/lib/db/connection';
import { firstParam, orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getEpisodeDetail } from '@/lib/services/episodes';
import { getAppSettings } from '@/lib/services/settings';
import {
  getDistributionTimeline,
  listApplicableMetrics,
  modeFieldName,
  valueFieldName,
} from '@/lib/services/snapshots';
import { isoToLocalInput, formatDateTime } from '@/lib/time';

export const metadata = { title: 'Tambah snapshot' };

export default async function NewSnapshotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; distId: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const { id, distId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const timeline = orNotFound(() => getDistributionTimeline(db, distId));
  const d = timeline.distribution;
  if (d.episodeId !== id) notFound();
  const { episode } = orNotFound(() => getEpisodeDetail(db, id));
  const title = d.variantLabel ? `${d.platformName} — ${d.variantLabel}` : d.platformName;

  const metrics: SnapshotMetricView[] = listApplicableMetrics(db, d.platformId).map((m) => ({
    id: m.id,
    label: m.label,
    unit: m.unit,
    aggregationKind: m.aggregationKind,
    currencyCode: m.currencyCode,
    allowNegative: m.allowNegative,
    platformName: m.platformName,
    hasSourceDefinition: Boolean(m.sourceDefinition),
  }));

  // `?supersedes=` is untrusted: only honour it for a snapshot of this distribution that is not yet corrected.
  const supersedesId = firstParam(sp.supersedes);
  const target = supersedesId ? timeline.snapshots.find((s) => s.snapshot.id === supersedesId && !s.supersededBy) : undefined;

  const initialValues: Record<string, string> = {};
  let supersedes: { id: string; description: string } | null = null;
  if (target) {
    supersedes = {
      id: target.snapshot.id,
      description: `snapshot ${formatDateTime(target.snapshot.capturedAt, timezone)} (${timezone})`,
    };
    initialValues.capturedAtLocal = isoToLocalInput(target.snapshot.capturedAt, timezone);
    initialValues.note = target.snapshot.note ?? '';
    for (const m of metrics) {
      const v = target.values.get(m.id);
      if (!v) continue;
      if (v.valueState === 'known') {
        initialValues[modeFieldName(m.id)] = 'value';
        if (v.numericValue !== null) {
          initialValues[valueFieldName(m.id)] =
            m.aggregationKind === 'ratio'
              ? String(Number((v.numericValue * 100).toFixed(8)))
              : String(v.numericValue);
        } else if (v.textValue !== null) {
          initialValues[valueFieldName(m.id)] = v.textValue;
        }
      } else if (v.valueState === 'not_available' || v.valueState === 'not_applicable') {
        initialValues[modeFieldName(m.id)] = v.valueState;
      }
    }
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { href: '/episodes', label: 'Episode' },
          { href: `/episodes/${id}`, label: episode.title },
          { href: `/episodes/${id}/distributions/${distId}`, label: title },
          { label: supersedes ? 'Koreksi snapshot' : 'Tambah snapshot' },
        ]}
      />
      <PageHeader
        title={supersedes ? 'Koreksi snapshot' : 'Tambah snapshot'}
        description={`${episode.title} — ${title}`}
      />
      <SnapshotForm
        action={recordSnapshotAction.bind(null, id, distId)}
        metrics={metrics}
        timezone={timezone}
        defaultCapturedAt={isoToLocalInput(new Date().toISOString(), timezone)}
        initialValues={initialValues}
        supersedes={supersedes}
        publishedAtKnown={d.publishedAt !== null}
        cancelHref={`/episodes/${id}/distributions/${distId}`}
      />
    </>
  );
}
