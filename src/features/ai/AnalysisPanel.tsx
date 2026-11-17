'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LuLoaderCircle } from 'react-icons/lu';
import { SafeMarkdown } from '@/components/ai/SafeMarkdown';
import { Alert } from '@/components/ui/feedback';
import { SECTION_LABELS, SECTIONS, type ConsentSummary } from '@/lib/ai/analysis';
import { PROVIDER_STATUS_LABELS, type ProviderId } from '@/lib/ai/types';
import type { AnalysisOutcome, AnalysisSubset } from '@/lib/services/ai';
import { formatDateTime } from '@/lib/time';
import { checkStatusAction, type ProviderSnapshot } from './actions';
import { CopyButton } from './SetupGuide';

interface Preview {
  consent: ConsentSummary;
  payloadHash: string;
  payloadJson: string;
  subset: AnalysisSubset;
}

type Phase =
  | { name: 'idle' }
  | { name: 'previewing' }
  | { name: 'consent'; preview: Preview }
  | { name: 'running'; preview: Preview }
  | { name: 'done'; outcome: AnalysisOutcome }
  | { name: 'error'; message: string };

const ADVISORY =
  'Keluaran AI adalah saran, bukan fakta. Periksa angkanya di tabel analitik sebelum bertindak; hipotesis belum terbukti dan korelasi bukan sebab-akibat.';

export function AnalysisPanel({
  providers,
  filters,
  timezone,
  backHref,
}: {
  providers: ProviderSnapshot[];
  filters: Record<string, string>;
  timezone: string;
  backHref: string;
}) {
  const [snaps, setSnaps] = useState(providers);
  const [provider, setProvider] = useState<ProviderId>(() => providers.find((p) => p.health?.status === 'connected')?.provider ?? providers[0]!.provider);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refresh = (id: ProviderId) => checkStatusAction(id).then((n) => setSnaps((all) => all.map((x) => (x.provider === n.provider ? n : x))));

  // Local status checks (never inference) for providers with no result yet, that were not connected last time (the user
  // may have just signed in from a terminal), or whose result is old.
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    providers
      .filter((s) => !s.health || s.health.status !== 'connected' || Date.now() - Date.parse(s.health.checkedAt) > STALE_MS)
      .forEach((s) => void refresh(s.provider));
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.name === 'consent' || phase.name === 'done') headingRef.current?.focus();
  }, [phase.name]);

  const selected = snaps.find((s) => s.provider === provider)!;
  const connected = selected.health?.status === 'connected';
  const busy = phase.name === 'previewing' || phase.name === 'running';

  async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; json: T }> {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    return { status: res.status, json: (await res.json()) as T };
  }

  async function review() {
    setPhase({ name: 'previewing' });
    try {
      const { json } = await post<({ ok: true } & Preview) | { ok: false; message: string }>('/api/ai/preview', { provider, includeTitles, filters });
      setPhase(json.ok ? { name: 'consent', preview: json } : { name: 'error', message: json.message });
    } catch {
      setPhase({ name: 'error', message: 'Tidak dapat menyiapkan ringkasan data.' });
    }
  }

  async function run(preview: Preview) {
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ name: 'running', preview });
    try {
      const { json } = await post<AnalysisOutcome | { ok: false; message: string }>(
        '/api/ai/analyze',
        { provider, includeTitles, filters, consent: true, payloadHash: preview.payloadHash },
        controller.signal,
      );
      if ('code' in json || json.ok) setPhase({ name: 'done', outcome: json as AnalysisOutcome });
      else setPhase({ name: 'error', message: json.message });
    } catch (error) {
      if ((error as Error).name === 'AbortError') setPhase({ name: 'idle' });
      else setPhase({ name: 'error', message: 'Permintaan gagal sebelum selesai.' });
    } finally {
      abort.current = null;
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="provider-heading" className="card">
        <h2 id="provider-heading" className="text-lg font-semibold">
          1. Pilih penyedia
        </h2>
        <fieldset className="mt-3" disabled={busy}>
          <legend className="sr-only">Penyedia AI</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {snaps.map((s) => (
              <label key={s.provider} className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${provider === s.provider ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
                <input type="radio" name="provider" value={s.provider} checked={provider === s.provider} onChange={() => { setProvider(s.provider); setPhase({ name: 'idle' }); }} className="mt-1" />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-sm text-muted">{s.health ? PROVIDER_STATUS_LABELS[s.health.status] : 'Memeriksa…'}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {!connected ? (
          <p className="field-hint" data-testid="not-connected-hint">
            {selected.name} belum terhubung. <Link href="/settings/ai-connections" className="text-primary underline underline-offset-2">Atur koneksi AI</Link>
            {' atau '}
            <button type="button" className="text-primary underline underline-offset-2" onClick={() => void refresh(provider)}>
              periksa status lagi
            </button>
            . Dasbor dan analitik tetap bisa dipakai tanpa AI.
          </p>
        ) : null}
        <div className="mt-4">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={includeTitles} disabled={busy} onChange={(e) => { setIncludeTitles(e.target.checked); setPhase({ name: 'idle' }); }} className="mt-1" />
            <span>
              <span className="font-semibold">Sertakan judul episode</span>
              <span className="block text-sm text-muted">Bawaan: hanya alias (E1, E2, …). Naskah, catatan, URL, dan kode tidak pernah dikirim.</span>
            </span>
          </label>
        </div>
        <button type="button" className="btn btn-primary mt-4" disabled={!connected || busy} onClick={review}>
          {phase.name === 'previewing' ? 'Menyiapkan…' : 'Tinjau data yang akan dikirim'}
        </button>
      </section>

      {phase.name === 'consent' || phase.name === 'running' ? (
        <section aria-labelledby="consent-heading" className="card" data-testid="consent">
          <h2 id="consent-heading" ref={headingRef} tabIndex={-1} className="mb-3 text-lg font-semibold">
            2. Persetujuan pengiriman data
          </h2>
          <Alert tone="warning" title={`Data berikut akan dikirim ke ${phase.preview.consent.provider}`}>
            {provider === 'gemini' ? 'Permintaan dikirim langsung dari server lokal SignalForge ke Gemini API menggunakan key dari environment OS.' : 'Permintaan dikirim melalui CLI resmi di komputer ini.'} Penyedia memproses data sesuai ketentuannya sendiri; SignalForge tidak dapat menariknya kembali.
          </Alert>
          {provider === 'gemini' ? (
            <Alert tone="warning" title="Ketentuan Gemini API Free Tier">
              Permintaan dikirim langsung ke Google melalui Gemini API. Pada Free Tier, Google dapat menggunakan prompt dan respons untuk meningkatkan produknya. Jangan lanjutkan bila ringkasan memuat informasi sensitif.
            </Alert>
          ) : null}
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Metrik dan usia target</dt>
              <dd className="font-semibold">{phase.preview.subset.metric} @ {phase.preview.subset.windowHours} jam</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Rentang tanggal terbit</dt>
              <dd className="font-semibold">{phase.preview.consent.dateRange}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Platform</dt>
              <dd className="font-semibold">{phase.preview.subset.platform}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Jumlah</dt>
              <dd className="font-semibold">
                {phase.preview.consent.counts.episodes} episode · {phase.preview.consent.counts.distributions} distribusi · {phase.preview.consent.counts.snapshots} snapshot
              </dd>
            </div>
          </dl>
          {phase.preview.consent.counts.truncated ? (
            <p className="field-hint">Hanya post terbaru yang disertakan (batas per analisis); sisanya tidak dikirim.</p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">Disertakan</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {phase.preview.consent.fields.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Tidak dikirim</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {phase.preview.consent.excluded.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Lihat payload persis ({phase.preview.consent.payloadChars.toLocaleString('id-ID')} karakter)</summary>
            <pre tabIndex={0} aria-label="Payload yang akan dikirim" className="mt-2 max-h-72 overflow-auto rounded-control border border-line bg-canvas p-3 text-xs">{phase.preview.payloadJson}</pre>
          </details>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {phase.name === 'consent' ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => run(phase.preview)}>
                  Lanjutkan dan kirim
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPhase({ name: 'idle' })}>
                  Batal
                </button>
              </>
            ) : (
              <>
                <p role="status" className="inline-flex items-center gap-2 font-semibold">
                  <LuLoaderCircle aria-hidden="true" className="animate-spin" />
                  Menganalisis dengan {phase.preview.consent.provider}…
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>
                  Batalkan analisis
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}

      {phase.name === 'error' ? (
        <Alert tone="danger" title="Analisis tidak dapat dilanjutkan" live="alert">
          {phase.message}
        </Alert>
      ) : null}

      {phase.name === 'done' ? <Result outcome={phase.outcome} timezone={timezone} headingRef={headingRef} onRetry={review} onClose={() => setPhase({ name: 'idle' })} backHref={backHref} /> : null}
    </div>
  );
}

function Result({
  outcome,
  timezone,
  headingRef,
  onRetry,
  onClose,
  backHref,
}: {
  outcome: AnalysisOutcome;
  timezone: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRetry: () => void;
  onClose: () => void;
  backHref: string;
}) {
  if (!outcome.ok) {
    return (
      <section aria-labelledby="result-heading" className="card" data-testid="ai-error">
        <h2 id="result-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
          Analisis tidak berhasil
        </h2>
        <div className="mt-3">
          <Alert tone="danger" live="alert">
            <span data-testid="ai-error-code">{outcome.code}</span>: {outcome.message} {outcome.remediation}
            <span className="block text-xs text-muted">Kode operasi {outcome.operationId}</span>
          </Alert>
        </div>
        <div className="mt-4 flex gap-2">
          {outcome.code !== 'CANCELLED' ? (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Tinjau ulang dan coba lagi
            </button>
          ) : null}
          <Link href={backHref} className="btn btn-secondary">
            Kembali ke analitik
          </Link>
        </div>
      </section>
    );
  }
  const plain = SECTIONS.map((s) => `## ${s}\n${outcome.sections[s]}`).join('\n\n');
  return (
    <section aria-labelledby="result-heading" className="card" data-testid="ai-result">
      <h2 id="result-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        Hasil analisis
      </h2>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted">Penyedia: </dt><dd className="inline font-semibold">{outcome.providerName}</dd></div>
        <div><dt className="inline text-muted">Model: </dt><dd className="inline font-semibold">{outcome.model ?? 'tidak dilaporkan'}</dd></div>
        <div><dt className="inline text-muted">Dibuat: </dt><dd className="inline font-semibold">{formatDateTime(outcome.generatedAt, timezone)}</dd></div>
        <div><dt className="inline text-muted">Data: </dt><dd className="inline font-semibold">{outcome.subset.metric} @ {outcome.subset.windowHours} j · {outcome.subset.dateRange}</dd></div>
      </dl>
      <div className="mt-3 space-y-3">
        <Alert tone="info" title="Saran, bukan fakta">{ADVISORY}</Alert>
        {outcome.unknownRefs.length > 0 ? (
          <Alert tone="warning" title="Rujukan tidak dikenal" live="status">
            Jawaban merujuk {outcome.unknownRefs.join(', ')}, yang tidak ada di data yang dikirim. Perlakukan klaim terkait dengan hati-hati.
          </Alert>
        ) : null}
      </div>
      <div className="mt-4 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s} aria-labelledby={`sec-${s.replace(/\s/g, '-')}`}>
            <h3 id={`sec-${s.replace(/\s/g, '-')}`} className="text-base font-semibold">
              {SECTION_LABELS[s]}
            </h3>
            <div className="mt-1">
              <SafeMarkdown text={outcome.sections[s]} />
            </div>
          </section>
        ))}
      </div>
      {outcome.legend.length > 0 ? (
        <details className="mt-4 text-sm" open>
          <summary className="cursor-pointer font-semibold">Legenda rujukan</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {outcome.legend.map((l) => (
              <div key={l.alias} className="contents">
                <dt className="font-semibold">{l.alias}</dt>
                <dd>{l.label}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton text={plain} label="Salin hasil analisis" />
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Tinjau ulang dan coba lagi
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Tutup hasil
        </button>
      </div>
      <p className="field-hint">Hasil tidak disimpan oleh SignalForge. Salin jika ingin menyimpannya.</p>
    </section>
  );
}
