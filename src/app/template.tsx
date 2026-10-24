import type { ReactNode } from 'react';

// A template remounts on every navigation, so the short enter animation (opacity + 4px lift; compositor-only)
// plays per page without any client JavaScript. Disabled by the global prefers-reduced-motion rule.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
