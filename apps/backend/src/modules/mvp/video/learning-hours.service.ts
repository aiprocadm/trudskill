import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';

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
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { WebinarsService } from '../../communication/webinars.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { ReportXlsxWriter } from '../report-builder/report-xlsx.writer.js';

import type { ReportCellValue, ReportColumn } from '../report-builder/report-types.js';

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
  /**
   * МГ-B4.2 (срез 8.8, РМ65–РМ67): статистика посещений поверх часов. Последний вход —
   * последняя сессия связанного пользователя (без связки — пусто); прогресс — среднее по
   * курсам зачисления; попытки — без черновиков; лучший балл и «сдал» — из итогов экзамена.
   */
  lastLoginAt?: string;
  progressPercent?: number;
  attemptsCount: number;
  bestScore?: number;
  maxScore?: number;
  examPassed?: boolean;
  /** Итог по зачислению (8.7a): «не явился» важнее балла. */
  resultCode?: string;
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
    @Inject(WebinarsService) private readonly webinars: WebinarsService,
    /* МГ-B4.2 (РМ66): последний вход — из сессий; без базы (память, тесты) поле пустое. */
    @Optional() @Inject(DatabaseService) private readonly db?: DatabaseService
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
    const lastLoginByLearner = await this.lastLoginsFor(
      tenantId,
      enrollments.map((e) => e.learnerId)
    );

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

      // МГ-B4.2 (РМ67): прогресс — среднее по курсам зачисления; попытки — без черновиков.
      const progressRows = this.state.courseProgress.filter(
        (p) => p.tenantId === tenantId && p.enrollmentId === enrollment.id
      );
      const progressPercent = progressRows.length
        ? Math.round(
            progressRows.reduce((sum, p) => sum + (p.progressPercent ?? 0), 0) / progressRows.length
          )
        : undefined;
      const attemptsCount = this.state.attempts.filter(
        (a) => a.tenantId === tenantId && a.enrollmentId === enrollment.id && a.status !== 'draft'
      ).length;
      const results = this.state.examResults.filter(
        (r) => r.tenantId === tenantId && r.enrollmentId === enrollment.id
      );
      const best = results.length
        ? results.reduce((top, r) =>
            (r.bestScore ?? r.finalScore ?? 0) > (top.bestScore ?? top.finalScore ?? 0) ? r : top
          )
        : undefined;
      const lastLoginAt = lastLoginByLearner.get(enrollment.learnerId);

      entries.push({
        enrollmentId: enrollment.id,
        learnerId: enrollment.learnerId,
        learnerName: this.learnerName(tenantId, enrollment.learnerId),
        enrollmentStatus: enrollment.status,
        materialSeconds,
        videoSeconds: Math.round(videoSeconds),
        testSeconds,
        webinarSeconds,
        ...hours,
        attemptsCount,
        ...(lastLoginAt ? { lastLoginAt } : {}),
        ...(progressPercent !== undefined ? { progressPercent } : {}),
        ...(best
          ? {
              bestScore: best.bestScore ?? best.finalScore ?? 0,
              maxScore: best.maxScore,
              examPassed: results.some((r) => r.passed)
            }
          : {}),
        ...(enrollment.resultCode ? { resultCode: enrollment.resultCode } : {})
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

  /**
   * РМ66: последний вход = последняя сессия пользователя, связанного со слушателем
   * (`linkedIamUserId`), одним запросом на группу. Колонка `learners.last_login_at` (0106)
   * не используется — её никто не пишет, источник правды — сессии. Без базы — пусто.
   */
  private async lastLoginsFor(
    tenantId: string,
    learnerIds: readonly string[]
  ): Promise<Map<string, string>> {
    const byLearner = new Map<string, string>();
    if (!this.db) return byLearner;
    const userByLearner = new Map<string, string>();
    for (const learner of this.state.learners) {
      if (learner.tenantId !== tenantId || !learnerIds.includes(learner.id)) continue;
      if (learner.linkedIamUserId) userByLearner.set(learner.id, learner.linkedIamUserId);
    }
    if (userByLearner.size === 0) return byLearner;
    const rows = await this.db.query<{ user_id: string; last_login_at: string | Date }>(
      `select user_id, max(created_at) as last_login_at
         from iam.sessions
        where tenant_id = $1 and user_id = any($2::text[])
        group by user_id`,
      [tenantId, Array.from(new Set(userByLearner.values()))]
    );
    const byUser = new Map(
      rows.map((row) => [
        row.user_id,
        row.last_login_at instanceof Date
          ? row.last_login_at.toISOString()
          : String(row.last_login_at)
      ])
    );
    for (const [learnerId, userId] of userByLearner) {
      const at = byUser.get(userId);
      if (at) byLearner.set(learnerId, at);
    }
    return byLearner;
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
  '№;Слушатель;Статус зачисления;Факт, ак. ч;План, ак. ч;Выполнение, %;Материалы, мин;Видео, мин;Тесты, мин;Вебинары, мин;Прогресс, %;Попытки;Лучший балл;Итог;Последний вход';

/** Итог строки статистики словом: «не явился» важнее балла (РМ67). */
export const learningJournalResultWord = (entry: LearningJournalEntry): string => {
  if (entry.resultCode === 'absent') return 'не явился';
  if (entry.resultCode === 'failed') return 'не сдал';
  if (entry.resultCode === 'passed' || entry.examPassed) return 'сдал';
  return '';
};

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
      minutes(entry.webinarSeconds),
      entry.progressPercent !== undefined ? String(entry.progressPercent) : '',
      String(entry.attemptsCount),
      entry.bestScore !== undefined ? `${entry.bestScore} из ${entry.maxScore ?? ''}`.trim() : '',
      learningJournalResultWord(entry),
      entry.lastLoginAt ? entry.lastLoginAt.slice(0, 10) : ''
    ].join(';')
  );
  return '﻿' + [LEARNING_JOURNAL_CSV_HEADER, ...body].join('\r\n');
}

export const LEARNING_JOURNAL_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XLSX_COLUMNS: ReportColumn[] = [
  { key: 'no', header: '№', type: 'number' },
  { key: 'learner', header: 'Слушатель', type: 'string' },
  { key: 'status', header: 'Статус зачисления', type: 'string' },
  { key: 'lastLogin', header: 'Последний вход', type: 'string' },
  { key: 'progress', header: 'Прогресс, %', type: 'number' },
  { key: 'factHours', header: 'Факт, ак. ч', type: 'number' },
  { key: 'plannedHours', header: 'План, ак. ч', type: 'number' },
  { key: 'completion', header: 'Выполнение, %', type: 'number' },
  { key: 'attempts', header: 'Попытки', type: 'number' },
  { key: 'bestScore', header: 'Лучший балл', type: 'string' },
  { key: 'result', header: 'Итог', type: 'string' },
  { key: 'materials', header: 'Материалы, мин', type: 'number' },
  { key: 'video', header: 'Видео, мин', type: 'number' },
  { key: 'tests', header: 'Тесты, мин', type: 'number' },
  { key: 'webinars', header: 'Вебинары, мин', type: 'number' }
];

/** МГ-B4.2: та же статистика книгой Excel — ТЗ просит XLSX, CSV остаётся для проверяющих. */
export async function renderLearningJournalXlsx(journal: LearningJournal): Promise<Buffer> {
  const minutes = (seconds: number): number => Math.round(seconds / 60);
  const rows: Record<string, ReportCellValue>[] = journal.entries.map((entry, index) => ({
    no: index + 1,
    learner: entry.learnerName,
    status: entry.enrollmentStatus,
    lastLogin: entry.lastLoginAt ? entry.lastLoginAt.slice(0, 10) : 'не входил',
    progress: entry.progressPercent ?? null,
    factHours: entry.factHours,
    plannedHours: entry.plannedHours ?? null,
    completion: entry.completionPercent ?? null,
    attempts: entry.attemptsCount,
    bestScore:
      entry.bestScore !== undefined ? `${entry.bestScore} из ${entry.maxScore ?? ''}`.trim() : '',
    result: learningJournalResultWord(entry),
    materials: minutes(entry.materialSeconds),
    video: minutes(entry.videoSeconds),
    tests: minutes(entry.testSeconds),
    webinars: minutes(entry.webinarSeconds)
  }));
  return new ReportXlsxWriter().build(XLSX_COLUMNS, rows);
}
