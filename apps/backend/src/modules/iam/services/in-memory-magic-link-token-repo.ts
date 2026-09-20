import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  MagicLinkTokenRecord,
  MagicLinkTokenRepo,
  PersistedMagicLinkToken
} from './magic-link.service.js';

@Injectable()
export class InMemoryMagicLinkTokenRepo implements MagicLinkTokenRepo {
  private readonly tokens: PersistedMagicLinkToken[] = [];
  /*
   * Когда запрошена каждая ссылка (ТЗ 17.1). Отдельным списком, а не полем записи: запись
   * описана общим для обоих хранилищ типом, и дописывать в него поле ради подсчёта значило бы
   * требовать его и от базы, где оно и так есть своим столбцом.
   */
  private readonly requestedAt = new Map<string, Date>();

  async save(record: MagicLinkTokenRecord): Promise<void> {
    const id = `mlt_${randomUUID().replace(/-/g, '')}`;
    this.tokens.push({
      ...record,
      id,
      consumedAt: null
    });
    this.requestedAt.set(id, new Date());
  }

  /** Подсчёт запросов по адресу за окно (ТЗ 17.1); регистр адреса не различается. */
  async countRequestsSince(tenantId: string, email: string, since: Date): Promise<number> {
    const needle = email.toLowerCase().trim();
    return this.tokens.filter(
      (row) =>
        row.tenantId === tenantId &&
        row.email.toLowerCase().trim() === needle &&
        (this.requestedAt.get(row.id) ?? new Date(0)) >= since
    ).length;
  }

  async findByHash(tenantId: string, tokenHash: string): Promise<PersistedMagicLinkToken | null> {
    return this.tokens.find((r) => r.tenantId === tenantId && r.tokenHash === tokenHash) ?? null;
  }

  async markConsumed(
    tenantId: string,
    id: string,
    _redeemedUserId: string,
    _redeemIp?: string,
    _redeemUserAgent?: string
  ): Promise<boolean> {
    const record = this.tokens.find((r) => r.id === id && r.tenantId === tenantId);
    if (record && record.consumedAt === null) {
      record.consumedAt = new Date();
      return true;
    }
    return false;
  }
}
