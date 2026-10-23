'use client';

// Replaces the root layout when it fails, so it brings its own <html>/<body> and no global CSS.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', color: '#1b1f27' }}>
        <title>Galat · SignalForge</title>
        <h1>SignalForge tidak dapat dimuat</h1>
        <p>Terjadi kesalahan tak terduga. Data lokal Anda tidak diubah oleh kesalahan ini.</p>
        <button type="button" onClick={() => retry()} style={{ padding: '0.5rem 1rem', fontWeight: 600 }}>
          Coba lagi
        </button>
      </body>
    </html>
  );
}
