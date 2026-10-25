/**
 * SignalForge mark: a measured series (four readings) rising to the latest point, which is highlighted.
 * Decorative by default (the app name is always rendered as text next to it).
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M7 22 L13 15.5 L18 19.5 L25 9.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="22" r="2" fill="#fff" />
      <circle cx="13" cy="15.5" r="2" fill="#fff" />
      <circle cx="18" cy="19.5" r="2" fill="#fff" />
      <circle cx="25" cy="9.5" r="3.2" fill="#fbbf24" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={36} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight tracking-tight">SignalForge</p>
        <p className="text-xs text-muted">Content Intelligence</p>
      </div>
    </div>
  );
}
