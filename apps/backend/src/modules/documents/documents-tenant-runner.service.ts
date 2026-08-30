import { Inject, Injectable } from '@nestjs/common';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { TenantSerialGateway } from '../../infrastructure/request/tenant-serial.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { TenantTimezoneService } from '../../infrastructure/tenant/tenant-timezone.service.js';

import type { DocumentsPersistenceBackend } from './infrastructure/documents-persistence.backend.js';

/** Выполняет операции над документами вне HTTP-запроса: load → fn → save под per-tenant lock. */
@Injectable()
export class DocumentsTenantRunner {
  constructor(
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly persistence: DocumentsPersistenceBackend,
    @Inject(TenantSerialGateway) private readonly tenantGateway: TenantSerialGateway,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(RealtimeEventsService) private readonly realtimeEvents: RealtimeEventsService,
    // Часовой пояс центра — ПОСЛЕДНИМ аргументом: тесты собирают бегунок позиционно,
    // и вставка в середину списка тихо подменила бы им соседнюю зависимость.
    @Inject(TenantTimezoneService) private readonly timezones: TenantTimezoneService
  ) {}

  async runWithTenantDocuments<R>(
    tenantId: string,
    fn: (documents: DocumentsService) => Promise<R>
  ): Promise<R> {
    return this.tenantGateway.runExclusive(tenantId, async () => {
      const state = new InMemoryDocumentsState();
      // Дата документа и период его номера считаются в поясе ЦЕНТРА (журнал 300).
      state.tenantTimezone = await this.timezones.resolve(tenantId);
      await this.persistence.loadIntoState(tenantId, state);
      const documents = new DocumentsService(state, this.auditService, this.realtimeEvents);
      try {
        return await fn(documents);
      } finally {
        await this.persistence.saveFromState(tenantId, state);
      }
    });
  }
}
