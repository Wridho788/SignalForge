import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  info: 'border-primary bg-primary-soft text-ink',
  success: 'border-success bg-success-soft text-ink',
  warning: 'border-warning bg-warning-soft text-ink',
  danger: 'border-danger bg-danger-soft text-ink',
};

// Status is never conveyed by color alone: each tone carries a text prefix.
const TONE_LABEL: Record<Tone, string> = {
  info: 'Info',
  success: 'Berhasil',
  warning: 'Perhatian',
  danger: 'Galat',
};

export function Alert({
  tone = 'info',
  title,
  children,
  live,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** 'alert' interrupts assistive tech (errors); 'status' is polite. */
  live?: 'alert' | 'status';
}) {
  return (
    <div role={live} className={`rounded-control border-l-4 p-4 text-sm ${TONE_CLASS[tone]}`}>
      <p className="font-semibold">
        <span className="uppercase tracking-wide">{TONE_LABEL[tone]}</span>
        {title ? `: ${title}` : null}
      </p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-prose text-muted">{children}</div> : null}
      {action ? (
        <Link href={action.href} className="btn btn-primary mt-4">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Badge({ tone = 'info', children }: { tone?: Tone | 'neutral'; children: ReactNode }) {
  const cls =
    tone === 'neutral'
      ? 'border-line bg-canvas text-ink'
      : tone === 'info'
        ? 'border-primary bg-primary-soft text-primary'
        : tone === 'success'
          ? 'border-success bg-success-soft text-success'
          : tone === 'warning'
            ? 'border-warning bg-warning-soft text-warning'
            : 'border-danger bg-danger-soft text-danger';
  return <span className={`badge ${cls}`}>{children}</span>;
}

/** Whitelisted flash messages shown after a redirect (`?notice=key`). Unknown keys render nothing. */
const NOTICES: Record<string, string> = {
  'episode-created': 'Episode dibuat.',
  'episode-updated': 'Episode diperbarui.',
  'episode-deleted': 'Episode dihapus beserta distribusi dan snapshot-nya.',
  'distribution-created': 'Distribusi ditambahkan.',
  'distribution-updated': 'Distribusi diperbarui.',
  'distribution-deleted': 'Distribusi dihapus beserta snapshot-nya.',
  'snapshot-created': 'Snapshot disimpan. Snapshot bersifat append-only; koreksi dilakukan dengan snapshot pengganti.',
  'settings-saved': 'Pengaturan disimpan.',
  'metric-created': 'Definisi metrik dibuat.',
  'metric-updated': 'Definisi metrik diperbarui.',
};

export function Notice({ code }: { code?: string | string[] }) {
  const key = Array.isArray(code) ? code[0] : code;
  const text = key ? NOTICES[key] : undefined;
  if (!text) return null;
  return (
    <div className="mb-4">
      <Alert tone="success" live="status">
        {text}
      </Alert>
    </div>
  );
}
