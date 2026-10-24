import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { NavLinks, type NavItem } from './NavLinks';

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Ringkasan', icon: 'overview' },
  { href: '/episodes', label: 'Episode', icon: 'episodes' },
  { href: '/analytics', label: 'Analitik', icon: 'analytics' },
  { href: '/experiments', label: 'Eksperimen', icon: 'experiments' },
  { href: '/imports', label: 'Impor & Ekspor', icon: 'data' },
  { href: '/settings', label: 'Pengaturan', icon: 'settings' },
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
      <aside className="border-b border-line bg-surface p-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-3 md:mb-6">
          <Logo />
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
