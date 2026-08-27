import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { gradeAttemptFromState } from './grade-attempt.js';
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
 * ⚠️ Ревизия 2026-08-27 (порция 30, журнал 285). Раньше оценка здесь НЕ выставлялась —
 * с оговоркой «дальше её обрабатывает обычный путь». Обычный путь не обрабатывал: попытка
 * навсегда оставалась с нулём, и ответы, честно данные до звонка, пропадали. Теперь сканер
 * СЧИТАЕТ баллы по сохранённым в срок ответам — тем же подсчётом, что и сдача (общая
 * функция `gradeAttemptFromState`). Лишнего времени это не даёт: ответы после истечения
 * сервер не принимает, поэтому засчитывается ровно записанное вовремя.
 *
 * Именно этот путь — главный: чаще всего попытка истекает не «на секунду позже кнопки»,
 * а потому, что человек закрыл вкладку.
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
      const test = state.tests.find(
        (item) => item.tenantId === tenantId && item.id === attempt.testId
      );
      const score = gradeAttemptFromState(state, tenantId, attempt, {
        now: () => asOf,
        makeAnswerId: () => `ans_${randomUUID().replace(/-/g, '')}`
      });
      attempt.score = score;
      if (test) attempt.passed = score >= test.rules.passingScore;
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
        // Балл в журнале: по нему видно, что попытку не просто «сняли с висяка»,
        // а оценили по сохранённому в срок (журнал 285).
        newValues: { status: 'expired', finishedAt: attempt.finishedAt, score }
      });
    }
    if (closed) {
      this.logger.log(`Closed ${closed} expired attempt(s) tenant=${tenantId}`);
    }
    return closed;
  }
}
