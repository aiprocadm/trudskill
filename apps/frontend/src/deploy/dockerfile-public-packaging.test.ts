import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from '../e2e/app-root';

/**
 * Deploy-readiness guard: the frontend runtime image MUST ship apps/frontend/public/.
 *
 * Next.js `output: 'standalone'` bundles the server + traced node_modules but NOT public/.
 * That directory holds the PWA icons and the Serwist-generated service worker (next.config
 * compiles src/app/sw.ts → public/sw.js). If the Dockerfile's runtime stage does not copy it,
 * `/sw.js` and `/icons/*` 404 in production and the PWA layer (Phase 10 Track C) silently breaks.
 *
 * This pins the packaging so it can't regress.
 */
/* Путь от файла: подбор из двух кандидатов по cwd угадывал запуск, а тут угадывать нечего. */
const dockerfilePath = [fromApp('Dockerfile')].find((path) => existsSync(path));

describe('frontend Dockerfile public/ packaging', () => {
  it('runtime stage copies apps/frontend/public into the image', () => {
    expect(dockerfilePath, 'frontend Dockerfile not found').toBeDefined();
    const contents = readFileSync(dockerfilePath!, 'utf8');

    const stageStarts = [...contents.matchAll(/^FROM .*$/gm)];
    const lastStage = stageStarts[stageStarts.length - 1];
    expect(lastStage, 'expected at least one FROM stage').toBeDefined();
    const runtimeStage = contents.slice(lastStage?.index ?? 0);

    const copiesPublic = runtimeStage
      .split('\n')
      .map((line) => line.trim())
      .some(
        (line) =>
          /^COPY\b/i.test(line) &&
          /apps\/frontend\/public/.test(line) &&
          / \.\/.*public$/.test(line)
      );

    expect(copiesPublic, 'runtime stage must COPY apps/frontend/public into the image').toBe(true);
  });
});
