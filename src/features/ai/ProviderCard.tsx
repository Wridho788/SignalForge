'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { LuPlug, LuTerminal } from 'react-icons/lu';
import { Alert } from '@/components/ui/feedback';
import type { TestOutcome } from '@/lib/ai/registry';
import { formatDateTime } from '@/lib/time';
import { cancelLoginAction, checkStatusAction, readStateAction, startLoginAction, testConnectionAction, type ProviderSnapshot } from './actions';
import { SetupGuide, CopyButton } from './SetupGuide';
import { StatusBadge } from './status';

const LOGIN_HOST = /(^|\.)(openai\.com|chatgpt\.com)$/i;

/** Defense in depth: the server already validates the URL; a non-https or foreign host is never rendered as a link. */
function safeLoginUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LOGIN_HOST.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function ProviderCard({ initial, timezone }: { initial: ProviderSnapshot; timezone: string }) {
  const [snap, setSnap] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | 'check' | 'test' | 'login'>(initial.health ? null : 'check');
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmTest, setConfirmTest] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const guideId = `guide-${snap.provider}`;
  const mounted = useRef(true);

  const Icon = snap.provider === 'claude' ? LuTerminal : LuPlug;
  const status = busy === 'check' ? 'checking' : (snap.health?.status ?? 'checking');
  const loginPending = snap.login.state === 'pending';

  const check = useCallback(() => {
    setBusy('check');
    startTransition(async () => {
      const next = await checkStatusAction(snap.provider);
      if (mounted.current) {
        setSnap(next);
        setBusy(null);
      }
    });
  }, [snap.provider]);

  // First visit: a LOCAL status check (is the CLI there? signed in?). It never runs inference.
  useEffect(() => {
    mounted.current = true;
    if (!initial.health) {
      void checkStatusAction(initial.provider).then((next) => {
        if (mounted.current) {
          setSnap(next);
          setBusy(null);
        }
      });
    }
    return () => {
      mounted.current = false;
    };
  }, [initial.health, initial.provider]);

  // While a sign-in is open, follow its state; a finished sign-in triggers a fresh local check on the server.
  useEffect(() => {
    if (!loginPending) return;
    const timer = setInterval(async () => {
      const next = await readStateAction(snap.provider);
      if (mounted.current) setSnap(next);
    }, 2000);
    return () => clearInterval(timer);
  }, [loginPending, snap.provider]);

  const primary = (() => {
    if (status === 'not_installed') return { label: 'Hubungkan', run: () => setGuideOpen(true) };
    if (status === 'not_authenticated') {
      return snap.inAppLogin
        ? { label: 'Masuk', run: startLogin }
        : { label: 'Masuk', run: () => setGuideOpen(true) };
    }
    if (status === 'connected') {
      return snap.inAppLogin ? { label: 'Hubungkan ulang', run: startLogin } : { label: 'Hubungkan ulang', run: () => setGuideOpen(true) };
    }
    return { label: 'Periksa status', run: check };
  })();

  function startLogin() {
    setLoginError(null);
    setBusy('login');
    startTransition(async () => {
      const res = await startLoginAction(snap.provider);
      if (mounted.current) {
        setSnap(res.snapshot);
        setLoginError(res.error);
        setBusy(null);
      }
    });
  }

  function runTest() {
    setConfirmTest(false);
    setOutcome(null);
    setBusy('test');
    startTransition(async () => {
      const res = await testConnectionAction(snap.provider, true);
      if (mounted.current) {
        setSnap(res.snapshot);
        setOutcome(res.outcome);
        setBusy(null);
      }
    });
  }

  const h = snap.health;
  const loginUrl = snap.login.state === 'pending' ? safeLoginUrl(snap.login.info.verificationUrl) : null;

  return (
    <section aria-labelledby={`${snap.provider}-name`} className="card" data-provider={snap.provider}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
            <Icon className="size-5" />
          </span>
          <div>
            <h2 id={`${snap.provider}-name`} className="text-lg font-semibold">
              {snap.name}
            </h2>
            <p className="text-sm text-muted">{snap.method}</p>
          </div>
        </div>
        <div aria-live="polite" className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>

      <p className="mt-3" data-testid={`${snap.provider}-message`}>
        {h ? h.displayMessage : 'Memeriksa status lokal…'}
      </p>
      {h?.remediation ? <p className="field-hint">{h.remediation}</p> : null}
      <p className="field-hint">
        Terakhir diperiksa: {h ? formatDateTime(h.checkedAt, timezone) : '—'}
        {h?.version ? ` · versi CLI ${h.version}` : ''}
        {h?.planLabel ? ` · paket ${h.planLabel}` : ''}
      </p>
      {h?.lastInference ? (
        <p className="field-hint">
          Uji permintaan terakhir: {h.lastInference.ok ? 'berhasil' : `gagal (${h.lastInference.code ?? 'galat'})`} · {formatDateTime(h.lastInference.at, timezone)}. “Terhubung” saja belum membuktikan permintaan berhasil.
        </p>
      ) : null}
      {h?.apiBilling ? (
        <div className="mt-3">
          <Alert tone="warning" title="Penagihan API">
            CLI memakai penagihan API/Console, bukan langganan Anda. SignalForge tidak beralih diam-diam.
          </Alert>
        </div>
      ) : null}

      {snap.login.state === 'pending' ? (
        <div className="mt-4 rounded-control border border-primary bg-primary-soft p-4" role="region" aria-label="Masuk dengan kode perangkat">
          <p className="font-semibold">Selesaikan login di halaman resmi</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Buka{' '}
              {loginUrl ? (
                <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">
                  {new URL(loginUrl).host}
                  <span className="sr-only"> (tab baru)</span>
                </a>
              ) : (
                <span>halaman login resmi penyedia</span>
              )}
              .
            </li>
            <li>
              Masukkan kode ini:{' '}
              <code className="rounded border border-line bg-surface px-2 py-0.5 text-base font-bold tracking-widest" data-testid="login-code">
                {snap.login.info.userCode}
              </code>
            </li>
          </ol>
          <p className="field-hint">Kode ini sekali pakai dan bukan token. SignalForge menunggu hasilnya dan tidak pernah melihat kredensial Anda.</p>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            onClick={() =>
              startTransition(async () => {
                const next = await cancelLoginAction(snap.provider);
                if (mounted.current) setSnap(next);
              })
            }
          >
            Batalkan login
          </button>
        </div>
      ) : null}
      {snap.login.state === 'failed' ? (
        <div className="mt-3">
          <Alert tone="warning" title="Login tidak selesai" live="status">
            Kode: {snap.login.code}. Tekan “Masuk” untuk mencoba lagi.
          </Alert>
        </div>
      ) : null}
      {loginError ? (
        <div className="mt-3">
          <Alert tone="danger" live="alert">
            {loginError}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={primary.run} disabled={pending || loginPending}>
          {busy === 'login' ? 'Memulai…' : primary.label}
        </button>
        <button type="button" className="btn btn-secondary" onClick={check} disabled={pending}>
          {busy === 'check' ? 'Memeriksa…' : 'Periksa status'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmTest(true)} disabled={pending || status === 'not_installed' || status === 'not_authenticated'}>
          {busy === 'test' ? 'Menguji…' : 'Uji koneksi'}
        </button>
        <button type="button" className="btn btn-secondary" aria-expanded={guideOpen} aria-controls={guideId} onClick={() => setGuideOpen((v) => !v)}>
          Cara menyiapkan
        </button>
      </div>

      {confirmTest ? (
        <div className="mt-3" role="group" aria-label="Konfirmasi uji koneksi">
          <Alert tone="info" title="Uji koneksi mengirim satu permintaan nyata">
            Satu pesan singkat (“balas OK”) akan dikirim ke {snap.name} dan dapat memakai kuota paket Anda. Tidak ada data dasbor yang dikirim.
            <span className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={runTest}>
                Kirim permintaan uji
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmTest(false)}>
                Batal
              </button>
            </span>
          </Alert>
        </div>
      ) : null}
      {outcome ? (
        <div className="mt-3" data-testid={`${snap.provider}-test-result`}>
          <Alert tone={outcome.ok ? 'success' : 'danger'} title={outcome.ok ? 'Uji berhasil' : 'Uji gagal'} live={outcome.ok ? 'status' : 'alert'}>
            {outcome.message}
            {outcome.remediation ? ` ${outcome.remediation}` : ''}
            {!outcome.ok ? ` (kode ${outcome.code}, operasi ${outcome.operationId})` : ''}
          </Alert>
        </div>
      ) : null}

      {guideOpen ? (
        <div id={guideId}>
          <SetupGuide provider={snap.provider} />
        </div>
      ) : null}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold">Diagnostik aman</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Status</dt>
          <dd>{h?.status ?? 'checking'}</dd>
          <dt className="text-muted">Terpasang</dt>
          <dd>{h ? (h.installed ? 'ya' : 'tidak') : '—'}</dd>
          <dt className="text-muted">Sudah masuk</dt>
          <dd>{h?.authenticated === null || h === null ? 'tidak diketahui' : h.authenticated ? 'ya' : 'tidak'}</dd>
          <dt className="text-muted">Kode galat</dt>
          <dd>{h?.errorCode ?? '—'}</dd>
          <dt className="text-muted">Mode</dt>
          <dd>{snap.testMode ? 'uji (penyedia palsu)' : 'CLI resmi'}</dd>
        </dl>
        <p className="field-hint">Tidak ada token, path kredensial, atau keluaran mentah penyedia di sini.</p>
        {h?.errorCode ? <CopyButton text={`${snap.provider} ${h.errorCode}`} label="Salin kode galat" /> : null}
      </details>
    </section>
  );
}
