'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconType } from 'react-icons';
import { LuArrowLeftRight, LuChartLine, LuClapperboard, LuFlaskConical, LuLayoutDashboard, LuSettings } from 'react-icons/lu';

// Icons cannot cross the server→client boundary as functions, so items carry a key resolved here.
const ICONS = {
  overview: LuLayoutDashboard,
  episodes: LuClapperboard,
  analytics: LuChartLine,
  experiments: LuFlaskConical,
  data: LuArrowLeftRight,
  settings: LuSettings,
} satisfies Record<string, IconType>;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold no-underline transition-colors ${
                active ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-canvas'
              }`}
            >
              <Icon aria-hidden="true" className={`size-[1.1rem] shrink-0 ${active ? '' : 'text-muted'}`} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
