import { randomUUID } from 'node:crypto';

import { COUNTRIES_SEED, EDUCATION_LEVELS_SEED } from './lookup.seed.js';

import type { CodeNameRow, LookupRepository, PositionRow } from './lookup.repository.js';

/** Режим без базы (`ALLOW_IN_MEMORY_STATE`, тесты): те же правила, что у Postgres, в памяти процесса. */
export class InMemoryLookupRepository implements LookupRepository {
  private readonly positions: PositionRow[] = [];

  async listPositions(tenantId: string, q: string, limit: number): Promise<PositionRow[]> {
    const needle = q.trim().toLowerCase();
    return this.positions
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.isActive &&
          (!needle || row.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'ru'))
      .slice(0, limit);
  }

  async rememberPositions(tenantId: string, names: ReadonlyArray<string>): Promise<number> {
    let added = 0;
    for (const name of names) {
      const exists = this.positions.some(
        (row) => row.tenantId === tenantId && row.name.toLowerCase() === name.toLowerCase()
      );
      if (exists) continue;
      this.positions.push({
        id: `pos_${randomUUID().replace(/-/g, '')}`,
        tenantId,
        name,
        isActive: true
      });
      added += 1;
    }
    return added;
  }

  async listEducationLevels(): Promise<CodeNameRow[]> {
    return [...EDUCATION_LEVELS_SEED];
  }

  async listCountries(): Promise<CodeNameRow[]> {
    return [...COUNTRIES_SEED];
  }
}
