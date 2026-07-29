import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  AcceptanceRow,
  AgreementRow,
  SimpleSignatureRepository
} from './simple-signature.repository.js';

@Injectable()
export class PostgresSimpleSignatureRepository implements SimpleSignatureRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findCurrentAgreement(tenantId: string): Promise<AgreementRow | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      version: number;
      body: string;
      body_hash: string;
      created_at: string;
    }>(
      `select tenant_id, version, body, body_hash, created_at
       from learning.esignature_agreements
       where tenant_id = $1 order by version desc limit 1`,
      [tenantId]
    );
    const row = rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          version: Number(row.version),
          body: row.body,
          bodyHash: row.body_hash,
          createdAt: row.created_at
        }
      : null;
  }

  async insertAgreement(tenantId: string, body: string, bodyHash: string): Promise<AgreementRow> {
    // Новая версия = max + 1 в одном запросе: старые строки не трогаем, они уже подписаны.
    const rows = await this.db.query<{
      tenant_id: string;
      version: number;
      body: string;
      body_hash: string;
      created_at: string;
    }>(
      `insert into learning.esignature_agreements (tenant_id, version, body, body_hash)
       values (
         $1,
         coalesce((select max(version) from learning.esignature_agreements where tenant_id = $1), 0) + 1,
         $2,
         $3
       )
       returning tenant_id, version, body, body_hash, created_at`,
      [tenantId, body, bodyHash]
    );
    const row = rows[0]!;
    return {
      tenantId: row.tenant_id,
      version: Number(row.version),
      body: row.body,
      bodyHash: row.body_hash,
      createdAt: row.created_at
    };
  }

  async findLatestAcceptance(tenantId: string, userId: string): Promise<AcceptanceRow | null> {
    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      agreement_version: number;
      body_hash: string;
      accepted_at: string;
      ip: string | null;
      user_agent: string | null;
    }>(
      `select id, tenant_id, user_id, agreement_version, body_hash, accepted_at, ip, user_agent
       from learning.esignature_acceptances
       where tenant_id = $1 and user_id = $2 order by agreement_version desc limit 1`,
      [tenantId, userId]
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          agreementVersion: Number(row.agreement_version),
          bodyHash: row.body_hash,
          acceptedAt: row.accepted_at,
          ...(row.ip ? { ip: row.ip } : {}),
          ...(row.user_agent ? { userAgent: row.user_agent } : {})
        }
      : null;
  }

  async insertAcceptance(input: Omit<AcceptanceRow, 'id' | 'acceptedAt'>): Promise<AcceptanceRow> {
    const rows = await this.db.query<{
      id: string;
      accepted_at: string;
    }>(
      `insert into learning.esignature_acceptances
         (id, tenant_id, user_id, agreement_version, body_hash, ip, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)
       -- Повтор той же версии не создаёт второе доказательство и не переписывает первое:
       -- юридически значим ПЕРВЫЙ момент принятия.
       on conflict (tenant_id, user_id, agreement_version) do update set user_id = excluded.user_id
       returning id, accepted_at`,
      [
        `esacc_${randomUUID()}`,
        input.tenantId,
        input.userId,
        input.agreementVersion,
        input.bodyHash,
        input.ip ?? null,
        input.userAgent ?? null
      ]
    );
    return { id: rows[0]!.id, acceptedAt: rows[0]!.accepted_at, ...input };
  }
}
