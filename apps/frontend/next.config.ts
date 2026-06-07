import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace workspace deps from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@cdoprof/ui'],
  // ESLint and TypeScript type-checking run as separate CI jobs; skip them
  // during `next build` to keep the production image build hermetic.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
};

export default nextConfig;
