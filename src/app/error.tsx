'use client';

import { Alert } from '@/components/ui/feedback';

// Next.js 16: error boundaries receive `error` (unknown) and `retry`.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  // Server errors reach the client with a generic message + digest (matches the server log); never render raw details.
  const digest = error instanceof Error && 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  return (
    <div className="card">
      <Alert tone="danger" title="Halaman gagal dimuat" live="alert">
        Terjadi kesalahan saat memuat halaman ini. Data lokal Anda tidak diubah oleh kesalahan ini.
        {digest ? <span> Kode referensi: {digest}.</span> : null}
      </Alert>
      <button type="button" onClick={() => retry()} className="btn btn-primary mt-4">
        Coba lagi
      </button>
    </div>
  );
}
