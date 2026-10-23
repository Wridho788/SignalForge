import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { APP_NAME, APP_TAGLINE } from '@/lib/identity';
import './globals.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · SignalForge` },
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
