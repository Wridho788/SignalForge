import Link from 'next/link';
import type { ReactNode } from 'react';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Bagian pengaturan" className="mb-6 flex gap-2 border-b border-line pb-3 text-sm font-semibold">
        <Link href="/settings" className="rounded-control px-3 py-2 text-ink hover:bg-canvas">
          Umum
        </Link>
        <Link href="/settings/metrics" className="rounded-control px-3 py-2 text-ink hover:bg-canvas">
          Metrik
        </Link>
      </nav>
      {children}
    </>
  );
}
