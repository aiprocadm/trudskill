import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from '../../documents/infrastructure/documents-persistence.token.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

import type { DocumentsPersistenceBackend } from '../../documents/infrastructure/documents-persistence.backend.js';
import type { TenantBranding } from '../../tenant/tenant-branding.js';

/**
 * ФТ-D2.3 (Фаза 4 Task 7): онбординг учебного центра.
 *
 * **Прогресс НЕ хранится флагами, а вычисляется из реальных данных.** Флаг «шаг пройден»
 * разъезжается с действительностью в обе стороны: администратор заполнил реквизиты через
 * обычный экран — мастер по-прежнему требует их; лицензию удалили — мастер считает её
 * заведённой. Здесь каждый шаг спрашивает «это уже есть?», поэтому «продолжить с места
 * остановки» работает само и после смены администратора, браузера и компьютера.
 *
 * **Откуда читаются данные (вскрыто живым прогоном):** курсы и комиссии живут НЕ в
 * типизированных `learning.courses`/`learning.commissions`, а в снимке состояния MVP
 * (`mvp_runtime_documents`, коллекции `courses`/`commissions`), шаблоны — в снимке
 * документов. Прямой `count(*)` по типизированным таблицам всегда возвращал бы ноль, и
 * эти шаги не закрылись бы никогда. Поэтому состояние читается штатными раннерами —
 * теми же, что использует остальной код вне HTTP-запроса.
 */

export const ONBOARDING_STEPS = [
  'requisites',
  'license',
  'branding',
  'commission',
  'template',
  'course'
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  /** Что именно уже сделано — чтобы админ видел, а не гадал. */
  detail?: string;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  doneCount: number;
  totalCount: number;
  /** Первый незакрытый шаг — на нём мастер и продолжится. */
  nextStepId: OnboardingStepId | null;
  ready: boolean;
}

@Injectable()
export class TenantOnboardingService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly documents: DocumentsPersistenceBackend,
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined
  ) {}

  async getStatus(tenantId: string): Promise<OnboardingStatus> {
    const [requisites, branding, licenses, mvp, templates] = await Promise.all([
      // Отсутствие реквизитов — не ошибка онбординга, а его непройденный шаг.
      this.tenants.getRequisites(tenantId).catch(() => null),
      // Тип фиксируется явно: без него `catch(() => ({}))` расширяет тип до
      // `TenantBranding | {}`, и поля бренда перестают быть видимыми.
      this.tenants.getBranding(tenantId).catch((): TenantBranding => ({})),
      this.activeLicenseCount(tenantId),
      this.mvpRunner
        .runWithTenantState(tenantId, async (state) => ({
          courses: state.courses.length,
          commissions: state.commissions.length
        }))
        .catch(() => ({ courses: 0, commissions: 0 })),
      this.templateCount(tenantId)
    ]);

    // Реквизиты считаются заполненными только когда есть И название, И ИНН: пустая
    // строка в обязательной колонке — это «строку создали», а не «реквизиты внесли».
    const requisitesDone = Boolean(requisites?.legalName?.trim() && requisites?.taxNumber?.trim());
    // Достаточно ЛЮБОГО осмысленного элемента бренда: центр без логотипа, но со своим
    // названием — уже не безликий, и заставлять его подбирать цвета незачем.
    const brandingDone = Object.keys(branding).length > 0;

    const steps: OnboardingStep[] = [
      {
        id: 'requisites',
        done: requisitesDone,
        ...(requisitesDone ? { detail: requisites!.legalName } : {})
      },
      { id: 'license', done: licenses > 0, detail: `Действующих лицензий: ${licenses}` },
      {
        id: 'branding',
        done: brandingDone,
        ...(branding.displayName ? { detail: branding.displayName } : {})
      },
      { id: 'commission', done: mvp.commissions > 0, detail: `Комиссий: ${mvp.commissions}` },
      { id: 'template', done: templates > 0, detail: `Шаблонов документов: ${templates}` },
      { id: 'course', done: mvp.courses > 0, detail: `Курсов: ${mvp.courses}` }
    ];

    const doneCount = steps.filter((step) => step.done).length;
    return {
      steps,
      doneCount,
      totalCount: steps.length,
      nextStepId: steps.find((step) => !step.done)?.id ?? null,
      ready: doneCount === steps.length
    };
  }

  private async activeLicenseCount(tenantId: string): Promise<number> {
    if (!this.databaseService) return 0;
    try {
      const rows = await this.databaseService.query<{ count: number }>(
        `select count(*)::int as count from org.training_licenses
         where tenant_id = $1 and status = 'active'`,
        [tenantId]
      );
      return rows[0]?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /** Чтение БЕЗ сохранения: `DocumentsTenantRunner` всегда пишет снимок обратно, а
   *  подсчёту шаблонов записывать нечего — лишняя запись только рискует данными. */
  private async templateCount(tenantId: string): Promise<number> {
    try {
      const state = new InMemoryDocumentsState();
      await this.documents.loadIntoState(tenantId, state);
      return state.templates.length;
    } catch {
      return 0;
    }
  }
}
