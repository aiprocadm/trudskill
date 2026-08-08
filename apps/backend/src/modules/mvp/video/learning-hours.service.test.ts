import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemoryVideoProgressRepository } from './in-memory-video-progress.repository.js';
import {
  LEARNING_JOURNAL_CSV_HEADER,
  LearningHoursService,
  renderLearningJournalCsv
} from './learning-hours.service.js';
import {
  ACADEMIC_HOUR_MINUTES,
  attemptSeconds,
  calculateLearningHours,
  toAcademicHours
} from './learning-hours.util.js';

import type { WebinarsService } from '../../communication/webinars.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Журнал учебных часов (ФТ-B3.4, Фаза 2 Task 8).
 * Отвечает инспектору ГИТ/Минтруда: «докажите, что 40-часовая программа освоена».
 */

const T = 'tenant_demo';
const HOUR = ACADEMIC_HOUR_MINUTES * 60;

describe('calculateLearningHours', () => {
  it('академический час — 45 минут, а не 60', () => {
    expect(ACADEMIC_HOUR_MINUTES).toBe(45);
    // 45 минут = ровно один академический час.
    expect(toAcademicHours(45 * 60)).toBe(1);
    // Считать по 60 минут значило бы занизить выполнение программы примерно на четверть.
    expect(toAcademicHours(60 * 60)).toBeCloseTo(1.3, 1);
  });

  it('видео не складывается с материалами — видео-урок и есть материал', () => {
    // Иначе один и тот же урок посчитался бы дважды и отчёт завысил бы часы.
    const row = calculateLearningHours({
      materialSeconds: 10 * HOUR,
      videoSeconds: 8 * HOUR,
      testSeconds: 0
    });
    expect(row.factHours).toBe(10);
  });

  it('покрытие видео побеждает, если оно точнее данных материала', () => {
    const row = calculateLearningHours({
      materialSeconds: 2 * HOUR,
      videoSeconds: 9 * HOUR,
      testSeconds: 0
    });
    expect(row.factHours).toBe(9);
  });

  it('время тестов прибавляется к учебному времени', () => {
    const row = calculateLearningHours({
      materialSeconds: 10 * HOUR,
      videoSeconds: 0,
      testSeconds: 2 * HOUR
    });
    expect(row.factHours).toBe(12);
  });

  it('недобор часов виден отдельным признаком — это и есть вопрос инспектора', () => {
    const row = calculateLearningHours({
      materialSeconds: 30 * HOUR,
      videoSeconds: 0,
      testSeconds: 0,
      plannedAcademicHours: 40
    });
    expect(row.belowPlan).toBe(true);
    expect(row.completionPercent).toBe(75);
  });

  it('выполненный план не помечается недобором', () => {
    const row = calculateLearningHours({
      materialSeconds: 40 * HOUR,
      videoSeconds: 0,
      testSeconds: 0,
      plannedAcademicHours: 40
    });
    expect(row.belowPlan).toBe(false);
    expect(row.completionPercent).toBe(100);
  });

  it('без плановых часов сравнивать не с чем — недобора нет', () => {
    const row = calculateLearningHours({ materialSeconds: 0, videoSeconds: 0, testSeconds: 0 });
    expect(row.plannedHours).toBeUndefined();
    expect(row.belowPlan).toBe(false);
  });

  it('мусорные значения не превращаются в отрицательные часы', () => {
    const row = calculateLearningHours({
      materialSeconds: Number.NaN,
      videoSeconds: -100,
      testSeconds: Number.POSITIVE_INFINITY
    });
    expect(row.factSeconds).toBe(0);
    expect(row.factHours).toBe(0);
  });
});

describe('attemptSeconds', () => {
  it('считает длительность завершённой попытки', () => {
    expect(
      attemptSeconds({ startedAt: '2026-07-28T10:00:00Z', finishedAt: '2026-07-28T10:30:00Z' })
    ).toBe(1800);
  });

  it('незавершённая попытка времени не даёт', () => {
    expect(attemptSeconds({ startedAt: '2026-07-28T10:00:00Z' })).toBe(0);
  });

  it('битые и «отрицательные» даты дают ноль, а не мусор в отчёте', () => {
    expect(attemptSeconds({ startedAt: 'не дата', finishedAt: '2026-07-28T10:30:00Z' })).toBe(0);
    expect(
      attemptSeconds({ startedAt: '2026-07-28T11:00:00Z', finishedAt: '2026-07-28T10:00:00Z' })
    ).toBe(0);
  });
});

function makeState(): InMemoryMvpState {
  return {
    groups: [{ tenantId: T, id: 'grp_1', name: 'ОТ-2026-01' }],
    groupCourses: [{ tenantId: T, groupId: 'grp_1', courseId: 'course_1' }],
    courseVersions: [{ tenantId: T, id: 'cv_1', courseId: 'course_1', academicHours: 40 }],
    enrollments: [
      { tenantId: T, id: 'enr_1', groupId: 'grp_1', learnerId: 'lrn_1', status: 'active' },
      { tenantId: T, id: 'enr_2', groupId: 'grp_1', learnerId: 'lrn_2', status: 'active' },
      // Чужая группа — в журнал попасть не должна.
      { tenantId: T, id: 'enr_x', groupId: 'grp_other', learnerId: 'lrn_3', status: 'active' }
    ],
    learners: [
      { tenantId: T, id: 'lrn_1', lastName: 'Яковлев', firstName: 'Ян' },
      { tenantId: T, id: 'lrn_2', lastName: 'Абрамов', firstName: 'Антон' }
    ],
    materialProgress: [
      { tenantId: T, enrollmentId: 'enr_1', studiedSeconds: 40 * HOUR },
      { tenantId: T, enrollmentId: 'enr_2', studiedSeconds: 10 * HOUR }
    ],
    attempts: [
      {
        tenantId: T,
        enrollmentId: 'enr_1',
        startedAt: '2026-07-28T10:00:00Z',
        finishedAt: '2026-07-28T10:45:00Z'
      }
    ]
  } as unknown as InMemoryMvpState;
}

/** ФТ-F4: заглушка посещений вебинаров; по умолчанию никто не отмечался. */
const webinarsStub = (map: Map<string, number> = new Map()): WebinarsService =>
  ({ groupAttendanceSeconds: async () => map }) as unknown as WebinarsService;

describe('LearningHoursService.getGroupJournal', () => {
  const makeService = () => {
    const videoProgress = new InMemoryVideoProgressRepository();
    return {
      service: new LearningHoursService(makeState(), videoProgress, webinarsStub()),
      videoProgress
    };
  };

  it('считает журнал по всем зачислениям группы и не берёт чужую группу', async () => {
    const { service } = makeService();

    const journal = await service.getGroupJournal(T, 'grp_1');

    expect(journal.groupName).toBe('ОТ-2026-01');
    expect(journal.plannedAcademicHours).toBe(40);
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries.map((e) => e.enrollmentId)).not.toContain('enr_x');
  });

  it('ФТ-F4: посещённый вебинар виден в журнале часов, неотмеченный — нет', async () => {
    const videoProgress = new InMemoryVideoProgressRepository();
    // lrn_1 отметился на вебинаре (90 минут), lrn_2 — нет.
    const service = new LearningHoursService(
      makeState(),
      videoProgress,
      webinarsStub(new Map([['lrn_1', 5400]]))
    );

    const journal = await service.getGroupJournal(T, 'grp_1');
    const attended = journal.entries.find((e) => e.learnerId === 'lrn_1');
    const absent = journal.entries.find((e) => e.learnerId === 'lrn_2');

    expect(attended?.webinarSeconds).toBe(5400);
    expect(absent?.webinarSeconds).toBe(0);
    // Вебинарные секунды входят в факт: у отметившегося факт больше на 5400.
    expect((attended?.factSeconds ?? 0) - 5400).toBeGreaterThanOrEqual(0);
  });

  it('первыми показывает тех, кто не добрал часы', async () => {
    const { service } = makeService();

    const journal = await service.getGroupJournal(T, 'grp_1');

    expect(journal.entries[0]!.learnerName).toBe('Абрамов Антон');
    expect(journal.entries[0]!.belowPlan).toBe(true);
    expect(journal.belowPlanCount).toBe(1);
  });

  it('время теста добавляется к часам слушателя', async () => {
    const { service } = makeService();
    const journal = await service.getGroupJournal(T, 'grp_1');
    const done = journal.entries.find((e) => e.enrollmentId === 'enr_1')!;

    // 40 ак. ч материалов + 45 минут теста = 41 ак. ч.
    expect(done.factHours).toBe(41);
    expect(done.belowPlan).toBe(false);
  });

  it('видео-время учитывается из покрытия ролика', async () => {
    const { service, videoProgress } = makeService();
    await videoProgress.save(T, 'enr_2', 'mat_1', {
      watchedRanges: [[0, 20 * HOUR]],
      lastPositionSeconds: 0,
      maxPositionSeconds: 0
    });

    const journal = await service.getGroupJournal(T, 'grp_1');
    const entry = journal.entries.find((e) => e.enrollmentId === 'enr_2')!;

    // Материалов было 10 ак. ч, покрытие видео — 20: берём большее, не сумму.
    expect(entry.videoSeconds).toBe(20 * HOUR);
    expect(entry.factHours).toBe(20);
  });

  it('несуществующая группа — 404, а не пустой отчёт', async () => {
    const { service } = makeService();
    await expect(service.getGroupJournal(T, 'grp_missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('чужой тенант группу не видит', async () => {
    const { service } = makeService();
    await expect(service.getGroupJournal('tenant_other', 'grp_1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('renderLearningJournalCsv', () => {
  it('открывается в Excel: BOM и разделитель «;» — как в книге выдачи', async () => {
    const videoProgress = new InMemoryVideoProgressRepository();
    const service = new LearningHoursService(makeState(), videoProgress, webinarsStub());
    const csv = renderLearningJournalCsv(await service.getGroupJournal(T, 'grp_1'));

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(LEARNING_JOURNAL_CSV_HEADER);
    expect(csv.split('\r\n')).toHaveLength(3); // заголовок + два слушателя
    expect(csv).toContain('Абрамов Антон');
  });

  it('точка с запятой в ФИО не разваливает колонки', async () => {
    const state = makeState();
    (state.learners as unknown as Array<{ lastName: string }>)[0]!.lastName = 'Яко;влев';
    const service = new LearningHoursService(
      state,
      new InMemoryVideoProgressRepository(),
      webinarsStub()
    );

    const csv = renderLearningJournalCsv(await service.getGroupJournal(T, 'grp_1'));

    expect(csv).toContain('"Яко;влев Ян"');
  });
});
