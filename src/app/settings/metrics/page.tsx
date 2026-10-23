import Link from 'next/link';
import { connection } from 'next/server';
import { Badge, Notice } from '@/components/ui/feedback';
import { PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { getDb } from '@/lib/db/connection';
import { AGGREGATION_KIND_LABELS } from '@/lib/domain/types';
import { type SearchParams } from '@/lib/page-helpers';
import { listMetricDefinitions } from '@/lib/services/metric-definitions';

export const metadata = { title: 'Definisi metrik' };

export default async function MetricsSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const defs = listMetricDefinitions(getDb());

  return (
    <>
      <Notice code={sp.notice} />
      <PageHeader
        title="Definisi metrik"
        description="Metrik tidak otomatis setara antar platform. Catat definisi sumber agar angka bisa dibaca dengan benar."
        actions={
          <Link href="/settings/metrics/new" className="btn btn-primary">
            Metrik baru
          </Link>
        }
      />
      <TableScroll label="Daftar definisi metrik">
        <table className="data-table">
          <caption className="sr-only">Definisi metrik, termasuk satuan, cakupan platform, dan kelengkapan definisi sumber.</caption>
          <thead>
            <tr>
              <th scope="col">Metrik</th>
              <th scope="col">Jenis · satuan</th>
              <th scope="col">Berlaku untuk</th>
              <th scope="col">Definisi sumber</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Nilai tercatat
              </th>
            </tr>
          </thead>
          <tbody>
            {defs.map((m) => (
              <tr key={m.id}>
                <th scope="row" className="!bg-transparent font-semibold">
                  <Link href={`/settings/metrics/${m.id}`} className="text-primary underline underline-offset-2">
                    {m.label}
                  </Link>
                  <span className="block text-xs font-normal text-muted">{m.key}</span>
                </th>
                <td>
                  {AGGREGATION_KIND_LABELS[m.aggregationKind]} · {m.unit}
                  {m.currencyCode ? ` (${m.currencyCode})` : ''}
                </td>
                <td>{m.platformName ?? 'Semua platform'}</td>
                <td>{m.sourceDefinition ? 'Tercatat' : <Badge tone="warning">Belum dicatat</Badge>}</td>
                <td>{m.isActive ? 'Aktif' : 'Nonaktif'}</td>
                <td className="num">{m.valueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
