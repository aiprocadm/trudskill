import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  MANAGER_DASHBOARD_DEFAULTS,
  type ManagerDashboard,
  type ManagerDashboardSettings,
  buildManagerDashboard,
  managerDashboardSettings
} from './manager-dashboard.util.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

/**
 * Панель руководителя (ТЗ 8.3).
 *
 * Своего хранилища нет намеренно — всё считается из состояния центра на лету. Предпосчитанные
 * счётчики пришлось бы пересчитывать при каждом зачислении, переносе срока и выдаче документа,
 * и они разошлись бы с действительностью при первом же пропущенном событии. Панель, которая
 * врёт, хуже отсутствующей.
 *
 * Документы берутся у службы документов, а не считаются здесь заново: два независимых подсчёта
 * «сколько выдано» неизбежно разъехались бы, и руководитель не понимал бы, какому числу верить.
 */
@Injectable()
export class ManagerDashboardService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    /*
     * Настройки центра — необязательная зависимость: панель работает и там, где база настроек
     * не поднята (внутренние прогоны, память). Метка `@Inject` обязательна — сборщик выбрасывает
     * сведения о типах, и зависимость «по типу» превращается в undefined уже на живом сервере
     * (сторож `di-explicit-injection`).
     */
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService
  ) {}

  /** Настройки панели центра; любая беда с их чтением означает умолчания, а не отказ. */
  private async settings(tenantId: string): Promise<ManagerDashboardSettings> {
    if (!this.tenants) return MANAGER_DASHBOARD_DEFAULTS;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return managerDashboardSettings(stored.payload);
    } catch {
      /* Настроек у центра может не быть вовсе — это не повод не показать панель. */
      return MANAGER_DASHBOARD_DEFAULTS;
    }
  }

  async compose(
    tenantId: string,
    asOf: string = new Date().toISOString()
  ): Promise<ManagerDashboard> {
    const scoped = <T extends { tenantId: string }>(items: T[]): T[] =>
      items.filter((item) => item.tenantId === tenantId);

    return buildManagerDashboard(
      {
        counterparties: scoped(this.state.counterparties),
        groups: scoped(this.state.groups),
        learners: scoped(this.state.learners),
        enrollments: scoped(this.state.enrollments),
        courseProgress: scoped(this.state.courseProgress),
        documents: this.documents.issuedDocumentRefs(tenantId)
      },
      asOf,
      await this.settings(tenantId)
    );
  }
}
