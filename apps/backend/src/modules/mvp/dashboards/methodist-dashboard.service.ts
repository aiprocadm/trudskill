import { Inject, Injectable } from '@nestjs/common';

import {
  DEADLINE_HORIZON_DAYS,
  type MethodistDashboard,
  buildMethodistDashboard
} from './methodist-dashboard.util.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { aggregateReviewerQueue } from '../reviewer-queue.service.js';

/**
 * ФТ-H2 (Фаза 5 Task 2): дашборд методиста.
 *
 * Своего хранилища нет намеренно — всё считается из состояния тенанта на лету.
 * Предпосчитанные счётчики пришлось бы пересчитывать при каждом зачислении, переносе
 * срока и публикации теста, и они разошлись бы с действительностью при первом же
 * пропущенном событии. Дашборд, который врёт, хуже отсутствующего.
 *
 * Очередь проверки НЕ пересчитывается заново: переиспользуется `aggregateReviewerQueue`,
 * которым живёт сам экран проверки. Два независимых подсчёта «непроверенных работ»
 * неизбежно разъехались бы, и методист не понимал бы, какому числу верить.
 */
export interface MethodistDashboardResult extends MethodistDashboard {
  reviewQueue: {
    pendingAttempts: number;
    pendingSubmissions: number;
    total: number;
  };
}

@Injectable()
export class MethodistDashboardService {
  constructor(@Inject(MVP_STATE) private readonly state: InMemoryMvpState) {}

  compose(
    tenantId: string,
    asOf: string = new Date().toISOString(),
    horizonDays: number = DEADLINE_HORIZON_DAYS
  ): MethodistDashboardResult {
    const scoped = <T extends { tenantId: string }>(items: T[]): T[] =>
      items.filter((item) => item.tenantId === tenantId);

    const dashboard = buildMethodistDashboard(
      {
        groups: scoped(this.state.groups),
        groupCourses: scoped(this.state.groupCourses),
        enrollments: scoped(this.state.enrollments),
        courses: scoped(this.state.courses),
        tests: scoped(this.state.tests)
      },
      asOf,
      horizonDays
    );

    const queue = aggregateReviewerQueue(
      {
        testAttempts: this.state.attempts,
        attemptAnswers: this.state.attemptAnswers,
        assignmentSubmissions: this.state.assignmentSubmissions,
        questions: this.state.questions
      },
      { tenantId }
    );

    return {
      ...dashboard,
      reviewQueue: {
        pendingAttempts: queue.pendingAttempts.length,
        pendingSubmissions: queue.pendingSubmissions.length,
        total: queue.pendingAttempts.length + queue.pendingSubmissions.length
      }
    };
  }
}
