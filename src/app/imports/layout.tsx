import Link from 'next/link';
import type { ReactNode } from 'react';

export default function ImportsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav aria-label="Bagian impor dan ekspor" className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3 text-sm font-semibold">
        <Link href="/imports" className="rounded-control px-3 py-2 text-ink hover:bg-canvas">
          Impor CSV
        </Link>
        <Link href="/imports/export" className="rounded-control px-3 py-2 text-ink hover:bg-canvas">
          Ekspor CSV
        </Link>
        <Link href="/imports/backup" className="rounded-control px-3 py-2 text-ink hover:bg-canvas">
          Cadangan &amp; pemulihan
        </Link>
      </nav>
      {children}
    </>
  );
}
