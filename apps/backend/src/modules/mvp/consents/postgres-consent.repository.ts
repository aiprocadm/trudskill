import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type { ConsentKind, ConsentSource } from './consent.js';
import type {
  ConsentDocumentRow,
  ConsentFactRow,
  ConsentRepository
} from './consent.repository.js';

interface DocumentDbRow {
  tenant_id: string;
  kind: string;
  version: number;
  body: string;
  body_hash: string;
  created_at: string;
}

interface FactDbRow {
  id: string;
  tenant_id: string;
  learner_id: string;
  kind: string;
  document_version: number | null;
  body_hash: string | null;
  granted_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
  source: string | null;
  actor_user_id: string | null;
  evidence_file_id: string | null;
}

const FACT_COLUMNS =
  'id, tenant_id, learner_id, kind, document_version, body_hash, granted_at, revoked_at, ip, user_agent, source, actor_user_id, evidence_file_id';

@Injectable()
export class PostgresConsentRepository implements ConsentRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private toDocument(row: DocumentDbRow): ConsentDocumentRow {
    return {
      tenantId: row.tenant_id,
      kind: row.kind as ConsentKind,
      version: Number(row.version),
      body: row.body,
      bodyHash: row.body_hash,
      createdAt: row.created_at
    };
  }

  private toFact(row: FactDbRow): ConsentFactRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      learnerId: row.learner_id,
      kind: row.kind as ConsentKind,
      ...(row.document_version === null ? {} : { documentVersion: Number(row.document_version) }),
      ...(row.body_hash ? { bodyHash: row.body_hash } : {}),
      grantedAt: row.granted_at,
      ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
      ...(row.ip ? { ip: row.ip } : {}),
      ...(row.user_agent ? { userAgent: row.user_agent } : {}),
      ...(row.source ? { source: row.source as ConsentSource } : {}),
      ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
      ...(row.evidence_file_id ? { evidenceFileId: row.evidence_file_id } : {})
    };
  }

  async findCurrentDocument(
    tenantId: string,
    kind: ConsentKind
  ): Promise<ConsentDocumentRow | null> {
    const rows = await this.db.query<DocumentDbRow>(
      `select tenant_id, kind, version, body, body_hash, created_at
       from learning.consent_documents
       where tenant_id = $1 and kind = $2 order by version desc limit 1`,
      [tenantId, kind]
    );
    return rows[0] ? this.toDocument(rows[0]) : null;
  }

  async insertDocument(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentDocumentRow> {
    // Новая версия = max + 1 в одном запросе: старые строки не трогаем, под ними подписались.
    const rows = await this.db.query<DocumentDbRow>(
      `insert into learning.consent_documents (tenant_id, kind, version, body, body_hash)
       values (
         $1,
         $2,
         coalesce((select max(version) from learning.consent_documents
                   where tenant_id = $1 and kind = $2), 0) + 1,
         $3,
         $4
       )
       returning tenant_id, kind, version, body, body_hash, created_at`,
      [tenantId, kind, body, bodyHash]
    );
    return this.toDocument(rows[0]!);
  }

  async findLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind
  ): Promise<ConsentFactRow | null> {
    const rows = await this.db.query<FactDbRow>(
      // Действующий факт важнее отозванного, и только потом — по времени: отзыв и
      // новое согласие могут лечь в одну миллисекунду, и сортировка по одному времени
      // вернула бы отозванный факт.
      `select ${FACT_COLUMNS}
       from learning.consent_facts
       where tenant_id = $1 and learner_id = $2 and kind = $3
       order by (revoked_at is not null), granted_at desc limit 1`,
      [tenantId, learnerId, kind]
    );
    return rows[0] ? this.toFact(rows[0]) : null;
  }

  async insertFact(
    input: Omit<ConsentFactRow, 'id' | 'grantedAt'> & { grantedAt?: string }
  ): Promise<ConsentFactRow> {
    const rows = await this.db.query<FactDbRow>(
      `insert into learning.consent_facts
         (id, tenant_id, learner_id, kind, document_version, body_hash, granted_at, revoked_at, ip, user_agent, source, actor_user_id, evidence_file_id)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, $9, $10, $11, $12, $13)
       returning ${FACT_COLUMNS}`,
      [
        `cfact_${randomUUID()}`,
        input.tenantId,
        input.learnerId,
        input.kind,
        input.documentVersion ?? null,
        input.bodyHash ?? null,
        // Пусто = «сейчас»; заполнено только при переносе исторического согласия.
        input.grantedAt ?? null,
        input.revokedAt ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
        input.source ?? 'self',
        input.actorUserId ?? null,
        input.evidenceFileId ?? null
      ]
    );
    return this.toFact(rows[0]!);
  }

  async revokeLatestFact(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    revokedAt: string
  ): Promise<ConsentFactRow | null> {
    // Отзывается ровно последнее действующее согласие: строка не удаляется, она
    // остаётся доказательством законности обработки до момента отзыва.
    const rows = await this.db.query<FactDbRow>(
      `update learning.consent_facts set revoked_at = $4
       where id = (
         select id from learning.consent_facts
         where tenant_id = $1 and learner_id = $2 and kind = $3 and revoked_at is null
         order by granted_at desc limit 1
       )
       returning ${FACT_COLUMNS}`,
      [tenantId, learnerId, kind, revokedAt]
    );
    return rows[0] ? this.toFact(rows[0]) : null;
  }
}
