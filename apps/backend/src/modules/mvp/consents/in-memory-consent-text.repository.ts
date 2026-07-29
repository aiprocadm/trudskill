import type { ConsentTextRepository, ConsentTextRow } from './consent-text.repository.js';
import type { ConsentKind } from './consent.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres). */
export class InMemoryConsentTextRepository implements ConsentTextRepository {
  private readonly rows: ConsentTextRow[] = [];

  async findCurrent(tenantId: string, kind: ConsentKind): Promise<ConsentTextRow | null> {
    const matching = this.rows.filter((r) => r.tenantId === tenantId && r.kind === kind);
    if (matching.length === 0) return null;
    return matching.reduce((a, b) => (b.version > a.version ? b : a));
  }

  async insert(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentTextRow> {
    const current = await this.findCurrent(tenantId, kind);
    const row: ConsentTextRow = {
      tenantId,
      kind,
      version: (current?.version ?? 0) + 1,
      body,
      bodyHash,
      createdAt: new Date().toISOString()
    };
    this.rows.push(row);
    return row;
  }
}
