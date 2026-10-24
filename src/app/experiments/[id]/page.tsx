import Link from 'next/link';
import { connection } from 'next/server';
import { Alert, Badge, Notice } from '@/components/ui/feedback';
import { Breadcrumbs, PageHeader, TableScroll } from '@/components/ui/layout-bits';
import { ResultStatus, ResultValue, known } from '@/features/analytics/components';
import {
  linkAction,
  noteAction,
  transitionAction,
  unlinkAction,
} from '@/features/experiments/actions';
import { StatusBadge, VerdictBadge, eventLabel } from '@/features/experiments/components';
import { InlineActionForm, LinkForm, NoteForm } from '@/features/experiments/forms';
import { getDb } from '@/lib/db/connection';
import {
  DECISION_LABELS,
  DESIGN_LABELS,
  ROLE_LABELS,
  areLinksEditable,
  isDefinitionEditable,
  isFinished,
} from '@/lib/experiments/model';
import { formatMetricValue } from '@/lib/metrics/format';
import { orNotFound, type SearchParams } from '@/lib/page-helpers';
import { getExperimentEvidence } from '@/lib/services/experiments';
import { getAppSettings } from '@/lib/services/settings';
import { formatDateTime, formatPostAge } from '@/lib/time';
import { PLATFORM_COLORS } from '@/features/analytics/components';

export const metadata = { title: 'Eksperimen' };

const pct = new Intl.NumberFormat('id-ID', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });

export default async function ExperimentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const { timezone } = getAppSettings(db);
  const ev = orNotFound(() => getExperimentEvidence(db, id));
  const { experiment: x, metric, secondaryMetrics, linkable, events } = ev.detail;
  const editableLinks = areLinksEditable(x.status);
  const platformName = (pid: string) => ev.links.find((l) => l.platformId === pid)?.platformName ?? pid;

  return (
    <>
      <Notice code={sp.notice} />
      <Breadcrumbs items={[{ href: '/experiments', label: 'Eksperimen' }, { label: x.title }]} />
      <PageHeader
        title={x.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={x.status} />
            {x.decision ? <Badge tone="info">Keputusan: {DECISION_LABELS[x.decision]}</Badge> : null}
          </span>
        }
      />

      <div className="mb-6 flex flex-wrap items-start gap-3">
        {isDefinitionEditable(x.status) ? (
          <Link href={`/experiments/${id}/edit`} className="btn btn-secondary">
            Ubah definisi
          </Link>
        ) : null}
        {x.status === 'draft' ? (
          <InlineActionForm action={transitionAction.bind(null, id, 'planned')} submitLabel="Tandai Direncanakan" />
        ) : null}
        {x.status === 'planned' ? (
          <>
            <InlineActionForm action={transitionAction.bind(null, id, 'running')} submitLabel="Mulai eksperimen" />
            <InlineActionForm action={transitionAction.bind(null, id, 'draft')} submitLabel="Kembali ke Draf" variant="secondary" />
          </>
        ) : null}
        {x.status === 'running' ? (
          <Link href={`/experiments/${id}/outcome`} className="btn btn-primary">
            Catat hasil
          </Link>
        ) : null}
        {!isFinished(x.status) ? (
          <InlineActionForm action={transitionAction.bind(null, id, 'cancelled')} submitLabel="Batalkan" variant="secondary" />
        ) : null}
        {x.status === 'draft' || x.status === 'cancelled' ? (
          <Link href={`/experiments/${id}/delete`} className="btn btn-secondary">
            Hapus…
          </Link>
        ) : null}
      </div>

      <section aria-labelledby="def-heading" className="card mb-6">
        <h2 id="def-heading" className="mb-3 text-lg font-semibold">
          Definisi
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Hipotesis</dt>
            <dd className="whitespace-pre-wrap">{x.hypothesis}</dd>
          </div>
          {x.rationale ? (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">Rasional</dt>
              <dd className="whitespace-pre-wrap">{x.rationale}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm text-muted">Variabel yang diuji</dt>
            <dd>{x.variableToTest}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Target audiens</dt>
            <dd>{x.targetAudience ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Desain</dt>
            <dd>{DESIGN_LABELS[x.design]}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Metrik utama</dt>
            <dd>
              {metric.label} ({metric.unit}) — definisi sumber {metric.sourceDefinition ? 'tercatat' : 'belum dicatat'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Kriteria sukses (ditetapkan sebelum hasil)</dt>
            <dd className="font-semibold">{ev.successDescription}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Metrik sekunder</dt>
            <dd>{secondaryMetrics.length ? secondaryMetrics.map((m) => m.label).join(', ') : '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Mulai · selesai ({timezone})</dt>
            <dd>
              {x.startedAt ? formatDateTime(x.startedAt, timezone) : '—'} · {x.endedAt ? formatDateTime(x.endedAt, timezone) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="links-heading" className="mb-6">
        <h2 id="links-heading" className="mb-1 text-lg font-semibold">
          Konten tertaut
        </h2>
        <p className="mb-3 text-sm text-muted">
          Nilai {metric.label} pada usia {x.windowHours} jam ± {x.toleranceHours} jam, dibaca dari snapshot yang paling dekat dengan usia target.
        </p>
        {ev.links.length === 0 ? (
          <p className="rounded-control border border-dashed border-line p-4 text-sm text-muted">
            Belum ada distribusi tertaut. Tautkan minimal satu baseline dan satu varian untuk memulai.
          </p>
        ) : (
          <TableScroll label="Distribusi tertaut ke eksperimen">
            <table className="data-table">
              <caption className="sr-only">
                Distribusi tertaut beserta peran dan nilai {metric.label} pada usia {x.windowHours} jam. Waktu dalam zona {timezone}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Peran</th>
                  <th scope="col">Konten</th>
                  <th scope="col">Terbit</th>
                  <th scope="col" className="num">
                    {metric.label}
                    <span className="block text-xs font-normal text-muted">{metric.unit}</span>
                  </th>
                  <th scope="col">Status data</th>
                  {secondaryMetrics.map((m) => (
                    <th key={m.id} scope="col" className="num">
                      {m.label}
                      <span className="block text-xs font-normal text-muted">{m.unit} (sekunder)</span>
                    </th>
                  ))}
                  {editableLinks ? <th scope="col">Aksi</th> : null}
                </tr>
              </thead>
              <tbody>
                {ev.links.map((l) => (
                  <tr key={l.distributionId}>
                    <th scope="row" className="!bg-transparent font-semibold">
                      {ROLE_LABELS[l.role]}
                    </th>
                    <td>
                      <Link href={`/episodes/${l.episodeId}/distributions/${l.distributionId}`} className="text-primary underline underline-offset-2">
                        {l.episodeTitle}
                      </Link>
                      <span className="block text-xs text-muted">
                        <span aria-hidden="true" className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: PLATFORM_COLORS[l.platformId] }} />
                        {l.platformName}
                        {l.variantLabel ? ` — ${l.variantLabel}` : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{l.publishedAt ? formatDateTime(l.publishedAt, timezone) : 'Tidak diketahui'}</td>
                    <td className="num">
                      <ResultValue result={l.primary} metric={metric} />
                      {l.primary.ok ? <span className="block text-xs text-muted">usia {formatPostAge(l.primary.actualAgeHours * 3600)}</span> : null}
                    </td>
                    <td>
                      <ResultStatus result={l.primary} />
                    </td>
                    {l.secondary.map((s) => (
                      <td key={s.metric.id} className="num">
                        <ResultValue result={s.result} metric={s.metric} />
                      </td>
                    ))}
                    {editableLinks ? (
                      <td>
                        <InlineActionForm action={unlinkAction.bind(null, id, l.distributionId)} submitLabel="Lepas" variant="secondary" />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {editableLinks && linkable.length > 0 ? (
          <LinkForm
            action={linkAction.bind(null, id)}
            options={linkable.map((d) => ({
              value: d.distributionId,
              label: `${d.episodeTitle} — ${d.platformName}${d.variantLabel ? ` (${d.variantLabel})` : ''}${d.publishedAt ? ` · terbit ${formatDateTime(d.publishedAt, timezone)}` : ' · terbit tidak diketahui'}`,
            }))}
          />
        ) : null}
        {editableLinks && linkable.length === 0 ? <p className="field-hint">Tidak ada distribusi lain yang bisa ditautkan.</p> : null}
      </section>

      <section aria-labelledby="evidence-heading" className="mb-6">
        <h2 id="evidence-heading" className="mb-1 text-lg font-semibold">
          Bukti sejauh ini
        </h2>
        <p className="mb-3 text-sm text-muted">
          Dihitung ulang dari snapshot setiap kali halaman dibuka. Tiap platform dinilai sendiri; post tanpa nilai sebanding tidak dihitung sebagai 0.
        </p>
        {ev.evidence.platforms.length === 0 ? (
          <p className="rounded-control border border-dashed border-line p-4 text-sm text-muted">
            Belum ada baseline atau varian tertaut, jadi belum ada yang bisa dibandingkan.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ev.evidence.platforms.map((p) => {
              const fmt = (n: number | null) => (n === null ? '—' : formatMetricValue(metric, known(n)).text);
              return (
                <div key={p.platformId} className="card">
                  <h3 className="mb-2 flex flex-wrap items-center justify-between gap-2 font-semibold">
                    <span>{platformName(p.platformId)}</span>
                    <VerdictBadge evidence={p} />
                  </h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted">Baseline (median)</dt>
                      <dd className="text-xl font-bold">{fmt(p.baseline.median)}</dd>
                      <dd className="text-muted">{p.baseline.comparable} sebanding dari {p.baseline.linked} tertaut</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Varian (median)</dt>
                      <dd className="text-xl font-bold">{fmt(p.variant.median)}</dd>
                      <dd className="text-muted">{p.variant.comparable} sebanding dari {p.variant.linked} tertaut</dd>
                    </div>
                  </dl>
                  {p.relativeGain !== null ? (
                    <p className="mt-2 text-sm">
                      Selisih relatif varian terhadap baseline: <strong>{pct.format(p.relativeGain)}</strong>
                    </p>
                  ) : null}
                  {p.warnings.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {p.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4">
          <Alert tone="info" title="Batas kesimpulan">
            <ul className="list-disc space-y-1 pl-5">
              {ev.evidence.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Alert>
        </div>
      </section>

      {x.decision && x.learning ? (
        <section aria-labelledby="outcome-heading" className="card mb-6">
          <h2 id="outcome-heading" className="mb-2 text-lg font-semibold">
            Hasil dan pembelajaran
          </h2>
          <p>
            <span className="text-sm text-muted">Keputusan: </span>
            <strong>{DECISION_LABELS[x.decision]}</strong>
          </p>
          <p className="mt-2 whitespace-pre-wrap">{x.learning}</p>
        </section>
      ) : null}

      <section aria-labelledby="log-heading" className="card">
        <h2 id="log-heading" className="mb-3 text-lg font-semibold">
          Riwayat dan log keputusan
        </h2>
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-3">
              <p className="text-sm">
                <span className="font-semibold">{eventLabel(e)}</span>
                <span className="text-muted"> · {formatDateTime(e.createdAt, timezone)} ({timezone})</span>
              </p>
              {e.note && e.kind !== 'status' ? <p className="whitespace-pre-wrap text-sm">{e.note}</p> : null}
            </li>
          ))}
        </ol>
        <p className="field-hint">Log bersifat append-only: entri tidak diubah atau dihapus.</p>
        <NoteForm action={noteAction.bind(null, id)} />
      </section>
    </>
  );
}
