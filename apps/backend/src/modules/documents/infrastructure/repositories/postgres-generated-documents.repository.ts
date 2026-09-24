import { Inject, Injectable } from '@nestjs/common';

import { decryptDocumentSnapshotAtRest } from '../../../../infrastructure/crypto/pii-crypto.js';
import { DatabaseService } from '../../../../infrastructure/database/database.service.js';
import { rowToEntity } from '../../../migration/backfill/normalized/normalized-projection.js';
import { likePattern } from '../../../mvp/infrastructure/repositories/registry-list-query.js';

import type {
  DocumentListPage,
  DocumentListQuery,
  GeneratedDocumentsRepository
} from './generated-documents.repository.js';
import type { IssuedDocumentFilter } from '../../documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents.types.js';

const COLUMNS =
  'id, tenant_id, created_at, updated_at, template_id, template_version_id, source_entity_type, ' +
  'source_entity_id, learner_id, group_id, counterparty_id, storage_file_id, status, is_final, ' +
  'document_number, document_date, generated_at, finalized_at, valid_until, archived_at, ' +
  'group_order_document_id, qr_token, revoked_at, revoked_by, revocation_reason, ' +
  'replaces_document_id, replaced_by_document_id, variables_snapshot, document_type, kind_code, ' +
  'name, pdf_file_id, enrollment_id, external_id, source_system, is_external, payload';

/** Строка таблицы → сущность снимка: снапшот подстановки расшифровывается на границе чтения, как у снимка. */
const toEntity = (row: Record<string, unknown>): GeneratedDocumentEntity =>
  decryptDocumentSnapshotAtRest(rowToEntity('generatedDocuments', row)) as GeneratedDocumentEntity;

/**
 * Выданные документы из `documents.generated_documents` (Фаза 1, срез 5b). Порядок списка —
 * по времени выдачи (`generated_at asc, id asc`), как порядок массива снимка; книга выдачи —
 * `document_date desc, id desc`, как `listIssuedDocuments`. Поиск — по названию, номеру и типу
 * (РМ43): снимок искал подстроку по JSON всего документа, включая ПДн из бланка (журнал 622).
 */
@Injectable()
export class PostgresGeneratedDocumentsRepository implements GeneratedDocumentsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, query: DocumentListQuery): Promise<DocumentListPage> {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    if (query.documentType) push(query.documentType, (p) => `document_type = ${p}`);
    if (query.sourceEntityType) push(query.sourceEntityType, (p) => `source_entity_type = ${p}`);
    if (query.sourceEntityId) push(query.sourceEntityId, (p) => `source_entity_id = ${p}`);
    if (query.search) {
      push(
        likePattern(query.search),
        (p) =>
          `(name ilike ${p} or document_number ilike ${p} or document_type ilike ${p} or coalesce(kind_code, '') ilike ${p})`
      );
    }
    const extra = conditions.map((c) => `and ${c}`).join(' ');
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from documents.generated_documents where tenant_id = $1 ${extra}`,
      params
    );
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from documents.generated_documents
        where tenant_id = $1 ${extra}
        order by generated_at asc, id asc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize]
    );
    return {
      items: rows.map(toEntity),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0)
    };
  }

  async get(tenantId: string, id: string): Promise<GeneratedDocumentEntity | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from documents.generated_documents where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async listIssued(
    tenantId: string,
    filter: IssuedDocumentFilter
  ): Promise<{ items: GeneratedDocumentEntity[]; total: number }> {
    const params: unknown[] = [tenantId];
    const conditions: string[] = [];
    const push = (value: unknown, condition: (p: string) => string): void => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };
    // В снимке даты сравнивались строками YYYY-MM-DD; документы без даты в период не попадают.
    if (filter.from) push(filter.from, (p) => `document_date >= ${p}::date`);
    if (filter.to) push(filter.to, (p) => `document_date <= ${p}::date`);
    if (filter.types && filter.types.length > 0) {
      push(filter.types, (p) => `document_type = any(${p}::text[])`);
    }
    if (filter.status) push(filter.status, (p) => `status = ${p}`);
    if (filter.groupOrderDocumentId) {
      push(filter.groupOrderDocumentId, (p) => `group_order_document_id = ${p}`);
    }
    const extra = conditions.map((c) => `and ${c}`).join(' ');
    const totals = await this.db.query<{ total: string }>(
      `select count(*)::text as total from documents.generated_documents where tenant_id = $1 ${extra}`,
      params
    );
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit !== undefined && filter.limit > 0 ? filter.limit : null;
    const rows = await this.db.query<Record<string, unknown>>(
      `select ${COLUMNS} from documents.generated_documents
        where tenant_id = $1 ${extra}
        order by document_date desc nulls last, id desc
        limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, offset]
    );
    return { items: rows.map(toEntity), total: Number(totals[0]?.total ?? 0) };
  }
}
