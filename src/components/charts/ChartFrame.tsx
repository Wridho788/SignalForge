'use client';

import { useRef, useState, type ReactNode } from 'react';

interface Tip {
  text: string;
  x: number;
  y: number;
}

/**
 * Hover/focus tooltip layer for server-rendered SVG charts. Marks carry `data-tip`; this shows the
 * same text on pointer hover AND keyboard focus. Tooltips only enhance: every value is also in the
 * chart's table view and in each mark's aria-label.
 */
export function ChartFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (target: EventTarget) => {
    const el = (target as Element).closest?.('[data-tip]');
    const host = ref.current;
    if (!el || !host) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    setTip({ text: el.getAttribute('data-tip') ?? '', x: r.left + r.width / 2 - h.left, y: r.top - h.top });
  };

  return (
    <div
      ref={ref}
      className="relative"
      onPointerOver={(e) => show(e.target)}
      onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)}
      onBlur={() => setTip(null)}
    >
      {children}
      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full whitespace-pre-line rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink shadow-sm"
          style={{ left: Math.max(70, tip.x), top: tip.y - 8 }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
