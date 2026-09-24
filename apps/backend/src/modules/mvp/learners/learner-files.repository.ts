import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

/** Файл личного дела — то, что видит карточка: имя, тип, размер, проверка антивирусом, когда загружен. */
export interface LearnerFileRow {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  antivirusStatus: string;
  uploadedAt: string;
}

/**
 * Хранилище файлов слушателя (срез 9.2, РМ95): тонкий репозиторий над `storage.file_links`
 * (сущность `learning.learner`, роль `attachment`) с соединением к `storage.files`. Своей
 * таблицы и миграции не нужно — связь «файл ↔ сущность» в платформе уже есть.
 */
export interface LearnerFilesRepository {
  list(tenantId: string, learnerId: string): Promise<LearnerFileRow[]>;
  get(tenantId: string, learnerId: string, fileId: string): Promise<LearnerFileRow | null>;
  attach(tenantId: string, learnerId: string, fileId: string): Promise<void>;
  /** Мягкое снятие связи; `false` — связи не было. */
  detach(tenantId: string, learnerId: string, fileId: string): Promise<boolean>;
}

export const LEARNER_FILES_REPOSITORY = Symbol('LEARNER_FILES_REPOSITORY');

const ENTITY = 'learning.learner';
const ROLE = 'attachment';

interface DbRow {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number | string;
  antivirus_status: string;
  linked_at: Date | string;
}

const toRow = (row: DbRow): LearnerFileRow => ({
  fileId: row.id,
  name: row.original_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  antivirusStatus: row.antivirus_status,
  uploadedAt: row.linked_at instanceof Date ? row.linked_at.toISOString() : String(row.linked_at)
});

const SELECT = `select f.id, f.original_name, f.mime_type, f.size_bytes, f.antivirus_status, l.created_at as linked_at
   from storage.file_links l
   join storage.files f on f.tenant_id = l.tenant_id and f.id = l.file_id
   where l.tenant_id = $1 and l.entity_type = '${ENTITY}' and l.entity_id = $2 and l.link_role = '${ROLE}'
     and l.deleted_at is null and f.deleted_at is null`;

@Injectable()
export class PostgresLearnerFilesRepository implements LearnerFilesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenantId: string, learnerId: string): Promise<LearnerFileRow[]> {
    const rows = await this.db.query<DbRow>(`${SELECT} order by l.created_at desc, f.id asc`, [
      tenantId,
      learnerId
    ]);
    return rows.map(toRow);
  }

  async get(tenantId: string, learnerId: string, fileId: string): Promise<LearnerFileRow | null> {
    const rows = await this.db.query<DbRow>(`${SELECT} and f.id = $3`, [
      tenantId,
      learnerId,
      fileId
    ]);
    return rows[0] ? toRow(rows[0]) : null;
  }

  async attach(tenantId: string, learnerId: string, fileId: string): Promise<void> {
    await this.db.query(
      `insert into storage.file_links (id, tenant_id, file_id, entity_type, entity_id, link_role, is_primary, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, false, now(), now())
       on conflict (tenant_id, file_id, entity_type, entity_id, link_role)
       do update set deleted_at = null, updated_at = now()`,
      [`fl_${Math.random().toString(36).slice(2, 12)}`, tenantId, fileId, ENTITY, learnerId, ROLE]
    );
  }

  async detach(tenantId: string, learnerId: string, fileId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `update storage.file_links set deleted_at = now(), updated_at = now()
       where tenant_id = $1 and entity_type = $2 and entity_id = $3 and file_id = $4 and link_role = $5
         and deleted_at is null
       returning id`,
      [tenantId, ENTITY, learnerId, fileId, ROLE]
    );
    return rows.length > 0;
  }
}

/** Память — для тестов службы; метаданные файла подкладывает тест через `registerFile`. */
export class InMemoryLearnerFilesRepository implements LearnerFilesRepository {
  private readonly files = new Map<string, LearnerFileRow & { tenantId: string }>();
  private readonly links: Array<{
    tenantId: string;
    learnerId: string;
    fileId: string;
    createdAt: string;
    deleted: boolean;
  }> = [];

  registerFile(tenantId: string, row: Omit<LearnerFileRow, 'uploadedAt'>): void {
    this.files.set(`${tenantId}:${row.fileId}`, { ...row, tenantId, uploadedAt: '' });
  }

  async list(tenantId: string, learnerId: string): Promise<LearnerFileRow[]> {
    return this.links
      .filter((l) => l.tenantId === tenantId && l.learnerId === learnerId && !l.deleted)
      .map((l) => {
        const file = this.files.get(`${tenantId}:${l.fileId}`);
        return file ? { ...file, uploadedAt: l.createdAt } : null;
      })
      .filter((row): row is LearnerFileRow & { tenantId: string } => row !== null)
      .map(({ tenantId: _tenant, ...row }) => row);
  }

  async get(tenantId: string, learnerId: string, fileId: string): Promise<LearnerFileRow | null> {
    return (await this.list(tenantId, learnerId)).find((row) => row.fileId === fileId) ?? null;
  }

  async attach(tenantId: string, learnerId: string, fileId: string): Promise<void> {
    const existing = this.links.find(
      (l) => l.tenantId === tenantId && l.learnerId === learnerId && l.fileId === fileId
    );
    if (existing) {
      existing.deleted = false;
      return;
    }
    this.links.push({
      tenantId,
      learnerId,
      fileId,
      createdAt: new Date().toISOString(),
      deleted: false
    });
  }

  async detach(tenantId: string, learnerId: string, fileId: string): Promise<boolean> {
    const link = this.links.find(
      (l) =>
        l.tenantId === tenantId && l.learnerId === learnerId && l.fileId === fileId && !l.deleted
    );
    if (!link) return false;
    link.deleted = true;
    return true;
  }
}
