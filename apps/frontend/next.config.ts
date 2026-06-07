import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace deps from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@cdoprof/ui'],
  // ESLint runs as a dedicated CI job (`pnpm lint`); skip it during the image build for speed.
  // TypeScript checking stays ON during the build — do not disable it.
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
