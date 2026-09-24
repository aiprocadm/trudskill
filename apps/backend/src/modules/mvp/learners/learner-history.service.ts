import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type AuditLogRecord, AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

/** Одна строка истории — «когда / кто / что / над чем», без значений полей (в них бывают ПДн). */
export interface LearnerHistoryItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  actorName?: string;
  /** Действие без актора — сделала система (сканер, планировщик, импорт). */
  system: boolean;
}

export interface LearnerHistory {
  items: LearnerHistoryItem[];
  /** Событий больше, чем показано: вкладка говорит об этом прямо, а не молчит. */
  truncated: boolean;
}

/** Сколько строк отдаём во вкладку — история карточки, а не журнал центра. */
export const LEARNER_HISTORY_LIMIT = 100;
/** Зачислений на слушателя, по которым собираются события; больше — редкость и не для карточки. */
const ENROLLMENTS_CAP = 20;

/** Сущности, под которыми пишутся события о слушателе: домен и доступ к ПДн. */
const LEARNER_ENTITIES = ['learning.learner', 'mvp.learner'] as const;

/**
 * История слушателя для вкладки карточки (ТЗ перехода §6.4 МГ-C2.1; срез 9.1, РМ91).
 *
 * Своя ручка под `learners.read`, а не журнал `/audit/events`: тот открыт только
 * администратору сеансов (`auth.manage_sessions`), а история нужна куратору. Возвращаются
 * события по самому слушателю и по его зачислениям, объединённые по времени.
 */
@Injectable()
export class LearnerHistoryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async compose(tenantId: string, learnerId: string): Promise<LearnerHistory> {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Слушатель не найден' });
    }
    const enrollmentIds = this.state.enrollments
      .filter((e) => e.tenantId === tenantId && e.learnerId === learnerId)
      .map((e) => e.id)
      .slice(0, ENROLLMENTS_CAP);

    const queries = [
      ...LEARNER_ENTITIES.map((entity) => ({ entity, entityId: learnerId })),
      ...enrollmentIds.map((entityId) => ({ entity: 'learning.enrollment', entityId }))
    ];
    const pages = await Promise.all(
      queries.map((filter) =>
        this.audit.listPage(tenantId, { ...filter, limit: LEARNER_HISTORY_LIMIT })
      )
    );

    const seen = new Set<string>();
    const records = pages
      .flatMap((page) => page.items)
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => (seen.has(record.id) ? false : (seen.add(record.id), true)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      items: records.slice(0, LEARNER_HISTORY_LIMIT).map(toItem),
      truncated: records.length > LEARNER_HISTORY_LIMIT
    };
  }
}

const toItem = (record: AuditLogRecord): LearnerHistoryItem => ({
  id: record.id,
  createdAt: record.createdAt,
  action: record.action,
  entityType: record.entityType,
  ...(record.actorName ? { actorName: record.actorName } : {}),
  system: !record.actorId
});
