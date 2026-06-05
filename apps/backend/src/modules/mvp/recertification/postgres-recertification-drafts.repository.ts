import { Injectable } from '@nestjs/common';

import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  RecertificationDraftRow,
  RecertificationDraftSeed,
  RecertificationDraftStatus,
  RecertificationDraftsQuery,
  RecertificationDraftsRepository
} from './recertification-drafts.repository.js';

interface DraftDbRow {
  id: string;
  tenant_id: string;
  learner_id: string;
  source_document_id: string;
  course_version_id: string;
  valid_until: string;
  status: string;
  resulting_enrollment_id: string | null;
  reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PostgresRecertificationDraftsRepository implements RecertificationDraftsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }> {
    const id = `recert_${Math.random().toString(36).slice(2, 10)}`;
    const inserted = await this.db.query<DraftDbRow>(
      `insert into learning.recertification_drafts
         (id, tenant_id, learner_id, source_document_id, course_version_id, valid_until, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'pending', now(), now())
       on conflict (tenant_id, learner_id, source_document_id) do nothing
       returning *`,
      [
        id,
        seed.tenantId,
        seed.learnerId,
        seed.sourceDocumentId,
        seed.courseVersionId,
        seed.validUntil
      ]
    );
    if (inserted[0]) {
      return { row: this.map(inserted[0]), created: true };
    }
    const existing = await this.db.query<DraftDbRow>(
      `select * from learning.recertification_drafts
       where tenant_id = $1 and learner_id = $2 and source_document_id = $3`,
      [seed.tenantId, seed.learnerId, seed.sourceDocumentId]
    );
    return { row: this.map(existing[0]!), created: false };
  }

  async list(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftRow[]> {
    const rows = query.status
      ? await this.db.query<DraftDbRow>(
          `select * from learning.recertification_drafts
           where tenant_id = $1 and status = $2 order by valid_until asc`,
          [tenantId, query.status]
        )
      : await this.db.query<DraftDbRow>(
          `select * from learning.recertification_drafts
           where tenant_id = $1 order by valid_until asc`,
          [tenantId]
        );
    return rows.map((r) => this.map(r));
  }

  async getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `select * from learning.recertification_drafts where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `update learning.recertification_drafts
         set status = 'approved', resulting_enrollment_id = $3, decided_by = $4, decided_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [tenantId, id, resultingEnrollmentId, decidedBy ?? null]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `update learning.recertification_drafts
         set status = 'rejected', reason = $3, decided_by = $4, decided_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [tenantId, id, reason ?? null, decidedBy ?? null]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  private map(row: DraftDbRow): RecertificationDraftRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      learnerId: row.learner_id,
      sourceDocumentId: row.source_document_id,
      courseVersionId: row.course_version_id,
      validUntil: row.valid_until,
      status: row.status as RecertificationDraftStatus,
      ...(row.resulting_enrollment_id
        ? { resultingEnrollmentId: row.resulting_enrollment_id }
        : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
