import path from 'node:path';
import { fileURLToPath } from 'node:url';

import withSerwistInit from '@serwist/next';

import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

// Phase 10 Track C — Serwist PWA service worker. Compiles src/app/sw.ts → public/sw.js and
// auto-registers it. Disabled in development so the SW cache doesn't interfere with HMR; the
// SW is exercised by the production build (and verified there). Existing rewrites (SCORM) are
// preserved by wrapping the same nextConfig.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development'
});

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace deps from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@trudskill/ui'],
  // ESLint runs as a dedicated CI job (`pnpm lint`); skip it during the image build for speed.
  // TypeScript checking stays ON during the build — do not disable it.
  eslint: { ignoreDuringBuilds: true },
  // Phase 9 (D6): same-origin for SCORM iframe in dev. In prod Caddy routes /api/v1/*
  // to the backend BEFORE Next, so this rewrite never fires. NEXT_PUBLIC_API_BASE_URL already
  // contains /api/v1, so the destination is ${apiBase}/scorm-content/:path*.
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) return [];
    return [
      { source: '/api/v1/scorm-content/:path*', destination: `${apiBase}/scorm-content/:path*` }
    ];
  }
};

export default withSerwist(nextConfig);
