import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  type IssueReadinessItem,
  type IssueReadinessLearnerFacts,
  type IssueReadinessReport,
  buildIssueReadiness,
  requireConsentBeforeIssueFrom
} from './issue-readiness.js';
import {
  IssuanceReadinessService,
  missingIssuanceSteps
} from '../../documents/issuance-readiness.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { ConsentService } from '../consents/consent.service.js';

import type { ExamReadinessIssue } from '../exam-readiness.js';

/**
 * МГ-F5.1 (срез 20.1): «что мешает выпустить документы» группы. Факты из снимка даёт
 * `MvpService.issueReadinessFacts`; здесь — то, что живёт вне снимка: настройка центра
 * «требовать согласие на ПДн перед выпуском» (РМ124, по умолчанию выключена), согласия
 * слушателей и готовность центра к выдаче (реквизиты, лицензия, комиссия, бланк, нумерация).
 *
 * Все три зависимости вне снимка необязательны: без базы (память, тесты) проверяется то, что
 * можно проверить, а не падает весь ответ.
 */
@Injectable()
export class IssueReadinessService {
  constructor(
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService,
    @Optional()
    @Inject(IssuanceReadinessService)
    private readonly center?: IssuanceReadinessService
  ) {}

  async requireConsent(tenantId: string): Promise<boolean> {
    if (!this.tenants) return false;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return requireConsentBeforeIssueFrom(stored.payload);
    } catch {
      /* Нет строки настроек — значение по умолчанию (выключено), а не отказ. */
      return false;
    }
  }

  private async centerItems(tenantId: string): Promise<IssueReadinessItem[]> {
    if (!this.center) return [];
    return missingIssuanceSteps(await this.center.readiness(tenantId));
  }

  async report(
    tenantId: string,
    facts: {
      groupIssues: IssueReadinessItem[];
      examIssues: ExamReadinessIssue[];
      learners: IssueReadinessLearnerFacts[];
    }
  ): Promise<IssueReadinessReport> {
    const [requireConsent, center] = await Promise.all([
      this.requireConsent(tenantId),
      this.centerItems(tenantId)
    ]);
    const learners = requireConsent
      ? await Promise.all(
          facts.learners.map(async (learner) => ({
            ...learner,
            consent: await this.consents.hasActiveConsent(tenantId, learner.id, 'personal_data')
          }))
        )
      : facts.learners;
    return buildIssueReadiness({
      center,
      groupIssues: facts.groupIssues,
      examIssues: facts.examIssues,
      learners,
      requireConsent
    });
  }
}
