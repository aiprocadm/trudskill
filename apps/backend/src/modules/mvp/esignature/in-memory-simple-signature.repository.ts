import { randomUUID } from 'node:crypto';

import type {
  AcceptanceRow,
  AgreementRow,
  SimpleSignatureRepository
} from './simple-signature.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) и юнит-тесты сервиса. */
export class InMemorySimpleSignatureRepository implements SimpleSignatureRepository {
  private readonly agreements: AgreementRow[] = [];
  private readonly acceptances: AcceptanceRow[] = [];

  async findCurrentAgreement(tenantId: string): Promise<AgreementRow | null> {
    return (
      this.agreements
        .filter((row) => row.tenantId === tenantId)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async insertAgreement(tenantId: string, body: string, bodyHash: string): Promise<AgreementRow> {
    const current = await this.findCurrentAgreement(tenantId);
    const row: AgreementRow = {
      tenantId,
      version: (current?.version ?? 0) + 1,
      body,
      bodyHash,
      createdAt: new Date().toISOString()
    };
    this.agreements.push(row);
    return row;
  }

  async findLatestAcceptance(tenantId: string, userId: string): Promise<AcceptanceRow | null> {
    return (
      this.acceptances
        .filter((row) => row.tenantId === tenantId && row.userId === userId)
        .sort((a, b) => b.agreementVersion - a.agreementVersion)[0] ?? null
    );
  }

  async insertAcceptance(input: Omit<AcceptanceRow, 'id' | 'acceptedAt'>): Promise<AcceptanceRow> {
    const existing = this.acceptances.find(
      (row) =>
        row.tenantId === input.tenantId &&
        row.userId === input.userId &&
        row.agreementVersion === input.agreementVersion
    );
    // Повторное принятие той же версии — не новое доказательство, а дубль.
    if (existing) return existing;

    const row: AcceptanceRow = {
      id: `esacc_${randomUUID()}`,
      acceptedAt: new Date().toISOString(),
      ...input
    };
    this.acceptances.push(row);
    return row;
  }
}
