import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the root to this project so a parent-directory lockfile/workspace is never picked up.
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  experimental: {
    // CSV import and backup restore upload files through Server Actions (default cap is 1 MB).
    // The app is loopback-only; the services additionally enforce their own, tighter limits
    // (CSV ≤ 2 MB, restore file ≤ 25 MB).
    serverActions: { bodySizeLimit: '30mb' },
  },
};

export default nextConfig;
