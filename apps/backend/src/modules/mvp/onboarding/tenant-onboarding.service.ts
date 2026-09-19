import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from '../../documents/infrastructure/documents-persistence.token.js';
import { tenantImageFileId } from '../../tenant/tenant-document-images.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

import type { DocumentsPersistenceBackend } from '../../documents/infrastructure/documents-persistence.backend.js';

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

/*
 * Порядок шагов — как в решении Р6 (ТЗ 8.2): сначала пять обязательных в естественной
 * последовательности «кто мы → на основании чего → кто подписывает → на чём печатаем → каким
 * номером», потом два необязательных.
 */
export const ONBOARDING_STEPS = [
  'requisites',
  'license',
  'commission',
  'template',
  'numbering',
  'signature',
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
  /** Незакрытые ОБЯЗАТЕЛЬНЫЕ шаги: пока список не пуст, документы выдавать нельзя (Р6). */
  missingRequired?: OnboardingStepId[];
  doneCount: number;
  totalCount: number;
  /** Первый незакрытый шаг — на нём мастер и продолжится. */
  nextStepId: OnboardingStepId | null;
  ready: boolean;
}

/**
 * Обязательные шаги первого запуска — решение владельца Р6 (ТЗ 8.2).
 *
 * Пять из семи. Необязательные: подпись с печатью (документ выпускается без них в черновике) и
 * первый курс (часто берётся из общей библиотеки). Логотип и цвета тоже не обязательны — это
 * предмет 13.3, а не условие работы центра.
 */
export const REQUIRED_STEPS: readonly OnboardingStepId[] = [
  'requisites',
  'license',
  'commission',
  'template',
  'numbering'
];

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
    /*
     * Бренд здесь больше не спрашивается: шаг «Логотип и цвета» решение Р6 в мастере не называет,
     * оформление — предмет задачи 13.3, а не условие начала работы (журнал 528).
     */
    const [requisites, licenses, mvp, templates, numbering, signature] = await Promise.all([
      // Отсутствие реквизитов — не ошибка онбординга, а его непройденный шаг.
      this.tenants.getRequisites(tenantId).catch(() => null),
      this.activeLicenseCount(tenantId),
      this.mvpRunner
        .runWithTenantState(tenantId, async (state) => ({
          courses: state.courses.length,
          commissions: state.commissions.length
        }))
        .catch(() => ({ courses: 0, commissions: 0 })),
      this.templateCount(tenantId),
      /*
       * ТЗ 8.2, решение Р6: нумератор документов — ОБЯЗАТЕЛЬНЫЙ шаг. Без него у документа нет
       * номера, а номер — это то, по чему документ находят в реестре при проверке.
       */
      this.numberingRuleCount(tenantId),
      /* Подпись и печать — шаг необязательный: документ выпускается и без них, в черновике. */
      this.signatureCount(tenantId)
    ]);

    // Реквизиты считаются заполненными только когда есть И название, И ИНН: пустая
    // строка в обязательной колонке — это «строку создали», а не «реквизиты внесли».
    const requisitesDone = Boolean(requisites?.legalName?.trim() && requisites?.taxNumber?.trim());
    const steps: OnboardingStep[] = [
      {
        id: 'requisites',
        done: requisitesDone,
        ...(requisitesDone ? { detail: requisites!.legalName } : {})
      },
      { id: 'license', done: licenses > 0, detail: `Действующих лицензий: ${licenses}` },
      { id: 'commission', done: mvp.commissions > 0, detail: `Комиссий: ${mvp.commissions}` },
      { id: 'template', done: templates > 0, detail: `Шаблонов документов: ${templates}` },
      { id: 'numbering', done: numbering > 0, detail: `Правил нумерации: ${numbering}` },
      { id: 'signature', done: signature > 0, detail: `Подписей и печатей: ${signature}` },
      { id: 'course', done: mvp.courses > 0, detail: `Курсов: ${mvp.courses}` }
    ];

    const doneCount = steps.filter((step) => step.done).length;
    /*
     * ТЗ 8.2 (Р6): «готов к работе» — это про ОБЯЗАТЕЛЬНЫЕ шаги, а не про все семь. Центр без
     * логотипа и без первого курса документы выдавать может; центр без нумератора — нет.
     */
    const missingRequired = steps
      .filter((step) => REQUIRED_STEPS.includes(step.id) && !step.done)
      .map((step) => step.id);

    return {
      steps,
      doneCount,
      totalCount: steps.length,
      nextStepId: steps.find((step) => !step.done)?.id ?? null,
      ready: missingRequired.length === 0,
      missingRequired
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
      // База недоступна — шаг покажется невыполненным; врать «выполнено» здесь опаснее.
      return 0;
    }
  }

  /** Чтение БЕЗ сохранения: `DocumentsTenantRunner` всегда пишет снимок обратно, а
   *  подсчёту шаблонов записывать нечего — лишняя запись только рискует данными. */
  /**
   * Правила нумерации документов (ТЗ 8.2, обязательный шаг Р6).
   *
   * Без правила у документа нет номера, а номер — это то, по чему документ находят в реестре
   * при проверке. Считается там же, где шаблоны: обе настройки живут в снимке документов.
   */
  private async numberingRuleCount(tenantId: string): Promise<number> {
    try {
      const state = new InMemoryDocumentsState();
      await this.documents.loadIntoState(tenantId, state);
      return state.numberingRules.length;
    } catch {
      // База недоступна — шаг покажется невыполненным; врать «выполнено» здесь опаснее.
      return 0;
    }
  }

  /**
   * Подпись руководителя и печать (необязательный шаг Р6).
   *
   * Они лежат в реквизитах центра как ссылки на файлы — теми же, что подставляются в бланк
   * тегами `{%tenant.signature_image}` и `{%tenant.stamp_image}`. Шаг считается сделанным, если
   * есть хотя бы одно из двух: документ выпускается и без них, в черновике.
   */
  private async signatureCount(tenantId: string): Promise<number> {
    try {
      const requisites = await this.tenants.getRequisites(tenantId);
      const images = (['signature', 'stamp'] as const).map((kind) =>
        tenantImageFileId(requisites, kind)
      );
      return images.filter(Boolean).length;
    } catch {
      // Реквизитов может не быть вовсе — это непройденный шаг, а не ошибка мастера.
      return 0;
    }
  }

  private async templateCount(tenantId: string): Promise<number> {
    try {
      const state = new InMemoryDocumentsState();
      await this.documents.loadIntoState(tenantId, state);
      return state.templates.length;
    } catch {
      // База недоступна — шаг покажется невыполненным; врать «выполнено» здесь опаснее.
      return 0;
    }
  }
}
