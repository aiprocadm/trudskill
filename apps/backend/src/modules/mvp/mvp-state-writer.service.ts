import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { LicensesService } from '../org/licenses.service.js';

/**
 * Изменение снимка центра ВНЕ HTTP-запроса — для долгих операций других модулей (импорт из
 * CDOPROF, срез 23.2). Тот же ход, что у `MvpEnrollmentService`: загрузить снимок под замком
 * центра, выполнить `fn` над MvpService этого снимка, сохранить. Документы и файлы MvpService
 * здесь не получает — кому они нужны, тот этим путём не ходит.
 *
 * Замок держится на весь вызов `fn`: долгую работу вызывающий режет на части, чтобы центр
 * между частями продолжал отвечать на запросы людей.
 */
@Injectable()
export class MvpStateWriter {
  constructor(
    @Inject(MvpTenantRunner) private readonly runner: MvpTenantRunner,
    @Inject(TenantScopedRepository)
    private readonly tenantScopedRepository: TenantScopedRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Optional() @Inject(LicensesService) private readonly licenses?: LicensesService
  ) {}

  run<R>(tenantId: string, fn: (mvp: MvpService) => R | Promise<R>): Promise<R> {
    return this.runner.runWithTenantStateAndSave(tenantId, async (state: InMemoryMvpState) =>
      fn(
        new MvpService(
          state,
          this.tenantScopedRepository,
          this.audit,
          undefined as never, // DocumentsService — не нужен записи слушателей и компаний
          undefined as never, // FilesService — то же
          this.events,
          this.licenses
        )
      )
    );
  }
}
