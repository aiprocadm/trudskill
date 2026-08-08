import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  type LearningHoursRow,
  attemptSeconds,
  calculateLearningHours
} from './learning-hours.util.js';
import {
  VIDEO_PROGRESS_REPOSITORY,
  type VideoProgressRepository
} from './video-progress.repository.js';
import { coveredSeconds } from './video-progress.util.js';
import { WebinarsService } from '../../communication/webinars.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

/**
 * Журнал учебной активности группы (ФТ-B3.4, Фаза 2 Task 8).
 *
 * Отвечает на вопрос инспектора ГИТ/Минтруда: «докажите, что 40-часовая программа
 * реально освоена». Галочка «пройдено» доказательством не является — нужно фактическое
 * время против плановых часов программы, по каждому слушателю.
 *
 * Request-scoped: читает состояние тенанта (группы, зачисления, слушатели, попытки).
 */

export interface LearningJournalEntry extends LearningHoursRow {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  enrollmentStatus: string;
  /** Из чего сложился факт — инспектор вправе спросить расшифровку. */
  materialSeconds: number;
  videoSeconds: number;
  testSeconds: number;
  /** ФТ-F4 (Фаза 5 Task 9): посещённые вебинары группы; неотмеченные не считаются. */
  webinarSeconds: number;
}

export interface LearningJournal {
  groupId: string;
  groupName: string;
  plannedAcademicHours?: number;
  entries: LearningJournalEntry[];
  /** Сколько слушателей не добрали плановых часов — то, что смотрят первым делом. */
  belowPlanCount: number;
}

@Injectable()
export class LearningHoursService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(VIDEO_PROGRESS_REPOSITORY) private readonly videoProgress: VideoProgressRepository,
    // ФТ-F4: посещённые вебинары группы — часть доказательной базы часов.
    @Inject(WebinarsService) private readonly webinars: WebinarsService
  ) {}

  async getGroupJournal(tenantId: string, groupId: string): Promise<LearningJournal> {
    const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
    if (!group) {
      throw new NotFoundException({ code: 'not_found', message: 'Группа не найдена' });
    }

    const plannedAcademicHours = this.plannedHoursForGroup(tenantId, groupId);
    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && e.groupId === groupId
    );
    // ФТ-F4: секунды посещённых вебинаров по слушателям — одним запросом на группу.
    const webinarSecondsByLearner = await this.webinars.groupAttendanceSeconds(tenantId, groupId);

    const entries: LearningJournalEntry[] = [];
    for (const enrollment of enrollments) {
      const materialSeconds = this.state.materialProgress
        .filter((p) => p.tenantId === tenantId && p.enrollmentId === enrollment.id)
        .reduce((sum, p) => sum + (p.studiedSeconds ?? 0), 0);

      const videoRows = await this.videoProgress.listByEnrollment(tenantId, enrollment.id);
      const videoSeconds = videoRows.reduce(
        (sum, row) => sum + coveredSeconds(row.watchedRanges),
        0
      );

      const testSeconds = this.state.attempts
        .filter((a) => a.tenantId === tenantId && a.enrollmentId === enrollment.id)
        .reduce((sum, a) => sum + attemptSeconds(a), 0);

      const webinarSeconds = webinarSecondsByLearner.get(enrollment.learnerId) ?? 0;

      const hours = calculateLearningHours({
        materialSeconds,
        videoSeconds,
        testSeconds,
        webinarSeconds,
        ...(plannedAcademicHours !== undefined ? { plannedAcademicHours } : {})
      });

      entries.push({
        enrollmentId: enrollment.id,
        learnerId: enrollment.learnerId,
        learnerName: this.learnerName(tenantId, enrollment.learnerId),
        enrollmentStatus: enrollment.status,
        materialSeconds,
        videoSeconds: Math.round(videoSeconds),
        testSeconds,
        webinarSeconds,
        ...hours
      });
    }

    // Сначала те, кто не добрал часы: инспектор смотрит именно их.
    entries.sort((a, b) => {
      if (a.belowPlan !== b.belowPlan) return a.belowPlan ? -1 : 1;
      return a.learnerName.localeCompare(b.learnerName, 'ru');
    });

    return {
      groupId,
      groupName: group.name,
      ...(plannedAcademicHours !== undefined ? { plannedAcademicHours } : {}),
      entries,
      belowPlanCount: entries.filter((entry) => entry.belowPlan).length
    };
  }

  /**
   * Плановые часы группы — из активной версии курса, привязанного к группе.
   * Курсов у группы может быть несколько: берём максимум, потому что план программы —
   * это верхняя планка, а не сумма разрозненных курсов.
   */
  private plannedHoursForGroup(tenantId: string, groupId: string): number | undefined {
    const courseIds = this.state.groupCourses
      .filter((gc) => gc.tenantId === tenantId && gc.groupId === groupId)
      .map((gc) => gc.courseId);
    const hours = this.state.courseVersions
      .filter((cv) => cv.tenantId === tenantId && courseIds.includes(cv.courseId))
      .map((cv) => cv.academicHours)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return hours.length ? Math.max(...hours) : undefined;
  }

  private learnerName(tenantId: string, learnerId: string): string {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) return learnerId;
    return (
      [learner.lastName, learner.firstName, learner.middleName]
        .filter((part) => Boolean(part && part.trim()))
        .join(' ') || learnerId
    );
  }
}

/** Заголовки CSV журнала часов — порядок колонок фиксирован. */
export const LEARNING_JOURNAL_CSV_HEADER =
  '№;Слушатель;Статус зачисления;Факт, ак. ч;План, ак. ч;Выполнение, %;Материалы, мин;Видео, мин;Тесты, мин;Вебинары, мин';

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSV журнала часов: BOM + `;` — тот же формат, что у книги выдачи. Без BOM Excel в
 * русской локали читает файл как Windows-1251 и ломает кириллицу.
 */
export function renderLearningJournalCsv(journal: LearningJournal): string {
  const minutes = (seconds: number): string => String(Math.round(seconds / 60));
  const body = journal.entries.map((entry, index) =>
    [
      String(index + 1),
      csvEscape(entry.learnerName),
      entry.enrollmentStatus,
      String(entry.factHours),
      entry.plannedHours !== undefined ? String(entry.plannedHours) : '',
      entry.completionPercent !== undefined ? String(entry.completionPercent) : '',
      minutes(entry.materialSeconds),
      minutes(entry.videoSeconds),
      minutes(entry.testSeconds),
      minutes(entry.webinarSeconds)
    ].join(';')
  );
  return '﻿' + [LEARNING_JOURNAL_CSV_HEADER, ...body].join('\r\n');
}
