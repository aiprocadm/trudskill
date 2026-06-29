import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  MagicLinkTokenRecord,
  MagicLinkTokenRepo,
  PersistedMagicLinkToken
} from './magic-link.service.js';

interface MagicLinkTokenRow {
  id: string;
  tenant_id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  request_ip: string | null;
  request_user_agent: string | null;
}

@Injectable()
export class PostgresMagicLinkTokenRepo implements MagicLinkTokenRepo {
  constructor(
    @Inject(DatabaseService)
    private readonly db: DatabaseService
  ) {}

  async save(record: MagicLinkTokenRecord): Promise<void> {
    await this.db.query(
      `insert into iam.magic_link_tokens
        (tenant_id, email, token_hash, expires_at, request_ip, request_user_agent)
       values ($1, $2, $3, $4::timestamptz, $5, $6)`,
      [
        record.tenantId,
        record.email,
        record.tokenHash,
        record.expiresAt.toISOString(),
        record.requestIp ?? null,
        record.requestUserAgent ?? null
      ]
    );
  }

  async findByHash(tenantId: string, tokenHash: string): Promise<PersistedMagicLinkToken | null> {
    const rows = await this.db.query<MagicLinkTokenRow>(
      `select id, tenant_id, email, token_hash,
              expires_at::text as expires_at,
              consumed_at::text as consumed_at,
              request_ip, request_user_agent
       from iam.magic_link_tokens
       where tenant_id = $1 and token_hash = $2
       limit 1`,
      [tenantId, tokenHash]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
      requestIp: row.request_ip ?? undefined,
      requestUserAgent: row.request_user_agent ?? undefined
    };
  }

  async markConsumed(
    tenantId: string,
    id: string,
    redeemedUserId: string,
    redeemIp?: string,
    redeemUserAgent?: string
  ): Promise<boolean> {
    // `returning id` makes the conditional update report whether it actually consumed
    // the token. With `consumed_at is null` in the WHERE clause, only the first of N
    // racing redeems gets a row back — the rest get an empty set and are rejected.
    const rows = await this.db.query<{ id: string }>(
      `update iam.magic_link_tokens
       set consumed_at = now(),
           redeemed_user_id = $3,
           redeem_ip = $4,
           redeem_user_agent = $5
       where tenant_id = $1 and id = $2 and consumed_at is null
       returning id`,
      [tenantId, id, redeemedUserId, redeemIp ?? null, redeemUserAgent ?? null]
    );
    return rows.length > 0;
  }
}
