import { randomUUID } from 'node:crypto';

import type { ConsentKind } from './consent.js';
import type {
  ConsentDocumentRow,
  ConsentFactRow,
  ConsentRepository
} from './consent.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) и юнит-тесты сервиса. */
export class InMemoryConsentRepository implements ConsentRepository {
  private readonly documents: ConsentDocumentRow[] = [];
  private readonly facts: ConsentFactRow[] = [];

  async findCurrentDocument(
    tenantId: string,
    kind: ConsentKind
  ): Promise<ConsentDocumentRow | null> {
    return (
      this.documents
        .filter((row) => row.tenantId === tenantId && row.kind === kind)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async insertDocument(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentDocumentRow> {
    const current = await this.findCurrentDocument(tenantId, kind);
    const row: ConsentDocumentRow = {
      tenantId,
      kind,
      version: (current?.version ?? 0) + 1,
      body,
      bodyHash,
      createdAt: new Date().toISOString()
    };
    this.documents.push(row);
    return row;
  }

  async findLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind
  ): Promise<ConsentFactRow | null> {
    return (
      this.facts
        .filter(
          (row) => row.tenantId === tenantId && row.learnerId === learnerId && row.kind === kind
        )
        // Действующий факт важнее отозванного, и только потом — по времени. Сортировка
        // по одному времени неустойчива: отзыв и новое согласие в одну миллисекунду
        // (клик «дать заново» сразу после отзыва) дали бы «последним» отозванный факт.
        .sort(
          (a, b) =>
            Number(Boolean(a.revokedAt)) - Number(Boolean(b.revokedAt)) ||
            b.grantedAt.localeCompare(a.grantedAt)
        )[0] ?? null
    );
  }

  async insertFact(input: Omit<ConsentFactRow, 'id' | 'grantedAt'>): Promise<ConsentFactRow> {
    const row: ConsentFactRow = {
      id: `cfact_${randomUUID()}`,
      grantedAt: new Date().toISOString(),
      ...input
    };
    this.facts.push(row);
    return row;
  }

  async revokeLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    revokedAt: string
  ): Promise<ConsentFactRow | null> {
    const latest = await this.findLatestFact(tenantId, learnerId, kind);
    // Отзывать нечего либо уже отозвано — повторный отзыв не создаёт второго события.
    if (!latest || latest.revokedAt) return null;
    latest.revokedAt = revokedAt;
    return latest;
  }
}
