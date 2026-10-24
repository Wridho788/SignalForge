import { connection } from 'next/server';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader } from '@/components/ui/layout-bits';
import { AnalysisPanel } from '@/features/ai/AnalysisPanel';
import { snapshotsForPage } from '@/features/ai/snapshots';
import { parseAnalyticsParams, queryToSearch } from '@/features/analytics/params';
import { isFakeMode } from '@/lib/ai/registry';
import { getDb } from '@/lib/db/connection';
import type { SearchParams } from '@/lib/page-helpers';
import { getAnalytics } from '@/lib/services/analytics';

export const metadata = { title: 'Analisis AI' };

export default async function AiAnalysisPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const { query, ignored } = parseAnalyticsParams(sp);
  const db = getDb();
  const report = getAnalytics(db, query);
  const filters = Object.fromEntries(
    Object.entries(sp)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v] as const)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && ['metric', 'window', 'platform', 'episode', 'tag', 'from', 'to'].includes(e[0])),
  );
  const back = `/analytics${queryToSearch(query)}`;

  return (
    <>
      <Breadcrumbs items={[{ href: '/analytics', label: 'Analitik' }, { label: 'Analisis AI' }]} />
      <PageHeader
        title="Analisis AI"
        description="Minta penyedia AI meringkas data yang sedang Anda filter. Opsional dan hanya berjalan saat Anda menekan tombolnya."
      />
      <div className="mb-4 space-y-3">
        {isFakeMode() ? (
          <Alert tone="warning" title="Mode uji">
            Penyedia palsu aktif (SIGNALFORGE_AI_MODE=fake). Tidak ada data yang keluar dari komputer ini.
          </Alert>
        ) : null}
        {ignored.length > 0 ? (
          <Alert tone="warning" title="Filter diabaikan" live="status">
            Nilai tidak valid untuk: {ignored.join(', ')}.
          </Alert>
        ) : null}
      </div>
      {!report.metric || report.quality.comparable === 0 ? (
        <EmptyState title="Belum ada data sebanding untuk dianalisis" action={{ href: back, label: 'Kembali ke analitik' }}>
          AI hanya menganalisis post yang punya nilai pada usia target. Catat snapshot atau ubah filter, lalu coba lagi.
        </EmptyState>
      ) : (
        <AnalysisPanel providers={await snapshotsForPage()} filters={filters} timezone={report.timezone} backHref={back} />
      )}
    </>
  );
}
