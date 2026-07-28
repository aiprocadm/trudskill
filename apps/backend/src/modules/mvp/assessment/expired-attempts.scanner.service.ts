import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Закрытие истёкших попыток теста (ФТ-E2, Фаза 2 Task 12).
 *
 * **Что было не так.** Серверный таймер существовал, но срабатывал ЛЕНИВО — только
 * когда клиент трогал попытку (сохранял ответ или сдавал работу). Если слушатель просто
 * закрыл вкладку, попытка навсегда оставалась `in_progress`: она занимала лимит попыток,
 * висела в отчётах как незавершённая и мешала выдать документ по группе.
 *
 * Теперь сервер закрывает такие попытки сам, не дожидаясь клиента.
 *
 * Оценку здесь НЕ выставляем: подсчёт баллов живёт в `MvpService` и зависит от типа
 * вопросов и ручной проверки. Задача сканера — снять «висяк», а не пересчитать экзамен;
 * попытка помечается `expired`, и дальше её обрабатывает обычный путь.
 */
@Injectable()
export class ExpiredAttemptsScanner {
  private readonly logger = new Logger(ExpiredAttemptsScanner.name);

  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  /** Возвращает число закрытых попыток. `asOf` — ISO-время, от которого считаем истечение. */
  scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): number {
    const now = new Date(asOf).getTime();
    if (!Number.isFinite(now)) return 0;

    let closed = 0;
    for (const attempt of state.attempts) {
      if (attempt.tenantId !== tenantId) continue;
      // Только живые попытки со сроком: терминальные трогать нельзя, бессрочные — нечем.
      if (attempt.status !== 'in_progress' || !attempt.expiresAt) continue;
      if (new Date(attempt.expiresAt).getTime() > now) continue;

      const previousStatus = attempt.status;
      attempt.status = 'expired';
      attempt.finishedAt = attempt.finishedAt ?? asOf;
      attempt.updatedAt = asOf;
      closed += 1;

      this.auditService.write({
        tenantId,
        actorId: 'system',
        action: 'assessment.attempt_expired_by_timer',
        entityType: 'assessment.attempt',
        entityId: attempt.id,
        oldValues: { status: previousStatus },
        newValues: { status: 'expired', finishedAt: attempt.finishedAt }
      });
    }
    if (closed) {
      this.logger.log(`Closed ${closed} expired attempt(s) tenant=${tenantId}`);
    }
    return closed;
  }
}
