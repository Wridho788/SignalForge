import type { ReactNode } from 'react';
import { APP_NAME, APP_TAGLINE } from '@/lib/identity';
import { NavLinks, type NavItem } from './NavLinks';

// Only pages that exist are linked; later milestones add Analytics, Experiments, Imports & Exports.
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Ringkasan' },
  { href: '/episodes', label: 'Episode' },
  { href: '/settings', label: 'Pengaturan' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold"
      >
        Lewati ke konten utama
      </a>
      <aside className="border-b border-line bg-surface p-4 md:border-b-0 md:border-r">
        <div className="mb-3 md:mb-6">
          <p className="text-lg font-bold leading-tight">{APP_NAME}</p>
          <p className="text-sm text-muted">{APP_TAGLINE}</p>
        </div>
        <nav aria-label="Navigasi utama">
          <NavLinks items={NAV_ITEMS} />
        </nav>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
