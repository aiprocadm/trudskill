import { Inject, Injectable, Logger } from '@nestjs/common';

import { normalizeGroupStatus } from './group-status.js';
import { todayIn } from '../../../common/utils/tenant-calendar.js';
import { AuditService } from '../../audit/audit.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Автопереходы статуса группы (ТЗ перехода §6.1 МГ-B3.1; Фаза 2, срез 8.2).
 *
 * Ежедневный обход, как у напоминаний: `recruiting → in_progress` в день начала при хотя бы
 * одном активном зачислении; `in_progress → exam` с момента открытия доступа к экзамену
 * (`examAccessFrom`) или в день экзамена (`examDate`). Переходы `exam → documents` и
 * `documents → closed` завязаны на выпуск протокола и пакета документов — Фаза 3 (РМ46),
 * до неё они делаются вручную. Даты календарные — в поясе центра (журнал 300).
 */
@Injectable()
export class GroupStatusScanner {
  private readonly logger = new Logger(GroupStatusScanner.name);

  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  /** Возвращает число переведённых групп. `asOf` — ISO-момент прогона. */
  scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): number {
    const now = new Date(asOf).getTime();
    if (!Number.isFinite(now)) return 0;
    const today = todayIn(state.tenantTimezone, new Date(asOf));

    let moved = 0;
    for (const group of state.groups) {
      if (group.tenantId !== tenantId) continue;
      const status = normalizeGroupStatus(group.status);
      let next: 'in_progress' | 'exam' | null = null;
      if (status === 'recruiting') {
        const started = !!group.startDate && group.startDate <= today;
        const hasActiveLearner = state.enrollments.some(
          (e) => e.tenantId === tenantId && e.groupId === group.id && e.status === 'active'
        );
        if (started && hasActiveLearner) next = 'in_progress';
      } else if (status === 'in_progress') {
        const accessOpen =
          !!group.examAccessFrom && new Date(group.examAccessFrom).getTime() <= now;
        const examDay = !!group.examDate && group.examDate <= today;
        if (accessOpen || examDay) next = 'exam';
      }
      if (!next) continue;

      const previous = group.status;
      group.status = next;
      group.updatedAt = asOf;
      moved += 1;
      this.auditService.write({
        tenantId,
        actorId: 'system',
        action: 'learning.group_status_auto',
        entityType: 'learning.group',
        entityId: group.id,
        oldValues: { status: previous },
        newValues: { status: next, asOf, today }
      });
    }
    if (moved) this.logger.log(`Group status scan moved ${moved} group(s) tenant=${tenantId}`);
    return moved;
  }
}
