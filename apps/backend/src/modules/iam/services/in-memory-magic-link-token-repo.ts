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

  async save(record: MagicLinkTokenRecord): Promise<void> {
    this.tokens.push({
      ...record,
      id: `mlt_${randomUUID().replace(/-/g, '')}`,
      consumedAt: null
    });
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
