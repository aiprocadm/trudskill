import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for a fresh-server deploy blocker.
 *
 * `DatabaseService.runMigrations` auto-runs on backend boot (DB_MIGRATIONS_ENABLED=true
 * in infra/.env.production.example) and reads `.sql` files from `resolveMigrationsDir()`,
 * whose candidates — relative to the container WORKDIR `/app` — are:
 *   1. `${DB_MIGRATIONS_DIR}` (default `migrations` → `/app/migrations`)
 *   2. `apps/backend/migrations`            → `/app/apps/backend/migrations`
 *
 * The runtime image only copies compiled `dist/` (JS, no `.sql`). If the Dockerfile's
 * runtime stage does not ALSO copy the raw `migrations/` directory, the backend boots,
 * throws `Migrations directory not found`, crash-loops, never goes healthy, and the
 * whole compose stack (frontend depends_on backend healthy) fails to come up.
 *
 * This test pins the packaging so the fix can't silently regress.
 */
const dockerfilePath = [
  join(process.cwd(), 'Dockerfile'),
  join(process.cwd(), 'apps/backend/Dockerfile')
].find((path) => existsSync(path));

// Destinations that resolveMigrationsDir() will actually find under WORKDIR /app.
const ACCEPTED_DESTINATIONS = ['./apps/backend/migrations', './migrations'];

describe('backend Dockerfile migration packaging', () => {
  it('has a runtime stage that copies the migrations directory to a path the runner resolves', () => {
    expect(dockerfilePath, 'backend Dockerfile not found').toBeDefined();
    const contents = readFileSync(dockerfilePath!, 'utf8');

    // Isolate the final (runtime) build stage — everything after the last `FROM`.
    const stageStarts = [...contents.matchAll(/^FROM .*$/gm)];
    expect(stageStarts.length, 'expected at least one FROM stage').toBeGreaterThan(0);
    const runtimeStage = contents.slice(stageStarts[stageStarts.length - 1].index ?? 0);

    const copiesMigrations = runtimeStage
      .split('\n')
      .map((line) => line.trim())
      .some((line) => {
        if (!/^COPY\b/i.test(line)) return false;
        if (!/migrations/.test(line)) return false;
        const dest = line.split(/\s+/).pop();
        return ACCEPTED_DESTINATIONS.includes(dest ?? '');
      });

    expect(
      copiesMigrations,
      'runtime stage must COPY the migrations directory to ./apps/backend/migrations or ./migrations'
    ).toBe(true);
  });
});
