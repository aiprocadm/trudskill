import type {
  DocumentListPage,
  DocumentListQuery,
  GeneratedDocumentsRepository
} from './generated-documents.repository.js';
import type { IssuedDocumentFilter } from '../../documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents.types.js';

/**
 * Репозиторий документов поверх массива — для тестов и режима `DOCUMENTS_PERSISTENCE_DRIVER=memory`.
 * Повторяет семантику SQL-репозитория: поиск по названию/номеру/типу, фильтры, порядок выдачи,
 * книга выдачи по дате документа по убыванию.
 */
export class InMemoryGeneratedDocumentsRepository implements GeneratedDocumentsRepository {
  constructor(private readonly rows: GeneratedDocumentEntity[]) {}

  async list(tenantId: string, query: DocumentListQuery): Promise<DocumentListPage> {
    let items = this.rows.filter((row) => row.tenantId === tenantId);
    if (query.documentType) items = items.filter((r) => r.documentType === query.documentType);
    if (query.sourceEntityType) {
      items = items.filter((r) => r.sourceEntityType === query.sourceEntityType);
    }
    if (query.sourceEntityId)
      items = items.filter((r) => r.sourceEntityId === query.sourceEntityId);
    if (query.search) {
      const needle = query.search.toLowerCase();
      items = items.filter((r) =>
        [r.name, r.documentNumber ?? '', r.documentType].some((v) =>
          v.toLowerCase().includes(needle)
        )
      );
    }
    items = [...items].sort(
      (a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id)
    );
    const from = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(from, from + query.pageSize).map((row) => ({ ...row })),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length
    };
  }

  async get(tenantId: string, id: string): Promise<GeneratedDocumentEntity | null> {
    const found = this.rows.find((row) => row.tenantId === tenantId && row.id === id);
    return found ? { ...found } : null;
  }

  async listIssued(
    tenantId: string,
    filter: IssuedDocumentFilter
  ): Promise<{ items: GeneratedDocumentEntity[]; total: number }> {
    let rows = this.rows.filter((d) => d.tenantId === tenantId);
    if (filter.from)
      rows = rows.filter((d) => d.documentDate !== undefined && d.documentDate >= filter.from!);
    if (filter.to)
      rows = rows.filter((d) => d.documentDate !== undefined && d.documentDate <= filter.to!);
    if (filter.types && filter.types.length > 0) {
      const set = new Set(filter.types);
      rows = rows.filter((d) => set.has(d.documentType));
    }
    if (filter.status) rows = rows.filter((d) => d.status === filter.status);
    if (filter.groupOrderDocumentId) {
      rows = rows.filter((d) => d.groupOrderDocumentId === filter.groupOrderDocumentId);
    }
    rows = [...rows].sort((a, b) => {
      const aDate = a.documentDate ?? '';
      const bDate = b.documentDate ?? '';
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    const total = rows.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit !== undefined && filter.limit > 0 ? filter.limit : total;
    return { items: rows.slice(offset, offset + limit).map((row) => ({ ...row })), total };
  }
}
