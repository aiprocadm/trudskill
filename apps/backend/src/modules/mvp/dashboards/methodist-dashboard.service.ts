import { Inject, Injectable } from '@nestjs/common';

import {
  type CourseWithoutExam,
  DEADLINE_HORIZON_DAYS,
  type MethodistDashboard,
  buildMethodistDashboard,
  coursesMissingFinalExam
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
export interface ReviewQueueSummary {
  pendingAttempts: number;
  pendingSubmissions: number;
  total: number;
}

export interface MethodistDashboardResult extends MethodistDashboard {
  reviewQueue?: ReviewQueueSummary;
  /**
   * Разделы, скрытые из-за нехватки прав. Показываются на экране как «нет доступа»,
   * а не молча пропускаются: пустой экран без объяснения читается как поломка.
   */
  hiddenSections: string[];
}

/** Пустая сводка по срокам — когда права на зачисления нет. */
const emptyScheduleSections = (asOf: string, horizonDays: number): MethodistDashboard => ({
  asOf,
  horizonDays,
  upcomingDeadlines: [],
  overdueGroups: [],
  coursesWithoutExam: [],
  totals: {
    activeGroups: 0,
    activeLearners: 0,
    upcomingDeadlines: 0,
    overdueGroups: 0,
    coursesWithoutExam: 0
  }
});

@Injectable()
export class MethodistDashboardService {
  constructor(@Inject(MVP_STATE) private readonly state: InMemoryMvpState) {}

  /**
   * **Разделы собираются ПО ПРАВАМ актора, а не по названию роли.**
   *
   * Живой прогон вскрыл, что у методиста в этой системе НЕТ прав `groups.read` и
   * `enrollments.read`: его роль — про содержание (курсы, материалы, тесты), а
   * группами и сроками ведает менеджер. Отдать методисту сроки групп «потому что
   * так написано в ТЗ» значило бы показать данные, которые ему намеренно не выдали.
   *
   * Поэтому экран один, а наполнение разное: у кого есть право на зачисления — видит
   * сроки, у кого есть право на курсы — пробелы в программах, у проверяющего —
   * очередь. Так один адрес честно работает и для методиста, и для менеджера, и для
   * администратора.
   */
  compose(
    tenantId: string,
    permissions: string[] = [],
    asOf: string = new Date().toISOString(),
    horizonDays: number = DEADLINE_HORIZON_DAYS
  ): MethodistDashboardResult {
    const can = (code: string) => permissions.includes(code);
    const scoped = <T extends { tenantId: string }>(items: T[]): T[] =>
      items.filter((item) => item.tenantId === tenantId);

    const hiddenSections: string[] = [];

    // Сроки и группы — только по праву на зачисления: именно оно разрешает видеть,
    // кто и до какого числа учится.
    const canSeeSchedule = can('enrollments.read');
    const schedule = canSeeSchedule
      ? buildMethodistDashboard(
          {
            groups: scoped(this.state.groups),
            groupCourses: scoped(this.state.groupCourses),
            enrollments: scoped(this.state.enrollments),
            courses: scoped(this.state.courses),
            tests: scoped(this.state.tests)
          },
          asOf,
          horizonDays
        )
      : emptyScheduleSections(asOf, horizonDays);
    if (!canSeeSchedule) hiddenSections.push('schedule');

    // Пробелы в программах — по праву на курсы: это разговор о содержании обучения,
    // а не о людях. Без права на зачисления они считаются ПО КУРСАМ, без названий
    // групп: иначе состав обучения утёк бы тому, кому его видеть не разрешено.
    const canSeeCourseGaps = can('courses.read');
    let coursesWithoutExam: CourseWithoutExam[] = [];
    if (!canSeeCourseGaps) {
      hiddenSections.push('coursesWithoutExam');
    } else if (canSeeSchedule) {
      coursesWithoutExam = schedule.coursesWithoutExam;
    } else {
      coursesWithoutExam = coursesMissingFinalExam(
        scoped(this.state.courses),
        scoped(this.state.tests)
      );
    }

    const canReview = can('assessment.reviews.review');
    let reviewQueue: ReviewQueueSummary | undefined;
    if (canReview) {
      const queue = aggregateReviewerQueue(
        {
          testAttempts: this.state.attempts,
          attemptAnswers: this.state.attemptAnswers,
          assignmentSubmissions: this.state.assignmentSubmissions,
          questions: this.state.questions
        },
        { tenantId }
      );
      reviewQueue = {
        pendingAttempts: queue.pendingAttempts.length,
        pendingSubmissions: queue.pendingSubmissions.length,
        total: queue.pendingAttempts.length + queue.pendingSubmissions.length
      };
    } else {
      hiddenSections.push('reviewQueue');
    }

    return {
      ...schedule,
      coursesWithoutExam,
      totals: { ...schedule.totals, coursesWithoutExam: coursesWithoutExam.length },
      ...(reviewQueue ? { reviewQueue } : {}),
      hiddenSections
    };
  }
}
