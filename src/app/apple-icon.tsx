import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Same mark as icon.svg, rendered once at build time for iOS home-screen shortcuts.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#4338ca' }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M7 22 L13 15.5 L18 19.5 L25 9.5" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7" cy="22" r="2" fill="#ffffff" />
          <circle cx="13" cy="15.5" r="2" fill="#ffffff" />
          <circle cx="18" cy="19.5" r="2" fill="#ffffff" />
          <circle cx="25" cy="9.5" r="3.2" fill="#fbbf24" />
        </svg>
      </div>
    ),
    size,
  );
}
