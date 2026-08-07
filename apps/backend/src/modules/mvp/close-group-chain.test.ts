import { describe, expect, it } from 'vitest';

import { partitionChainCandidates } from './close-group-chain.js';

import type { ExamReadinessIssue } from './exam-readiness.js';
import type { Enrollment, ExamResult, Learner } from './mvp.types.js';

/**
 * ФТ-E3 (Фаза 5 Task 7): отбор кандидатов цепочки — чистые правила.
 * Частичный успех: отсев одного слушателя не трогает остальных, причина именуется.
 */

const base = {
  tenantId: 't1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
};

const enrollment = (id: string, learnerId: string, status = 'completed'): Enrollment =>
  ({
    ...base,
    id,
    learnerId,
    groupId: 'g1',
    status,
    enrolledAt: '2026-08-01T00:00:00.000Z'
  }) as Enrollment;

const learner = (id: string, lastName: string): Learner =>
  ({ ...base, id, status: 'active', firstName: 'Иван', lastName }) as Learner;

const exam = (enrollmentId: string, passed: boolean): ExamResult =>
  ({
    ...base,
    id: `er_${enrollmentId}`,
    testId: 'test1',
    enrollmentId,
    learnerId: 'x',
    attemptsCount: 1,
    maxScore: 10,
    passed
  }) as ExamResult;

const snilsIssue = (learnerId: string): ExamReadinessIssue => ({
  scope: 'learner',
  subjectId: learnerId,
  code: 'learner_snils_missing',
  message: 'Не заполнен СНИЛС — запись в реестре не будет принята'
});

describe('отбор кандидатов цепочки закрытия группы (ФТ-E3)', () => {
  it('сдавший завершённый слушатель проходит; остальные отсеиваются поимённо с причиной', () => {
    const result = partitionChainCandidates({
      enrollments: [
        enrollment('e_ok', 'l_ok'),
        enrollment('e_active', 'l_active', 'active'),
        enrollment('e_noexam', 'l_noexam'),
        enrollment('e_failed', 'l_failed'),
        enrollment('e_nosnils', 'l_nosnils')
      ],
      examResultsByEnrollmentId: new Map([
        ['e_ok', [exam('e_ok', true)]],
        ['e_failed', [exam('e_failed', false)]],
        ['e_nosnils', [exam('e_nosnils', true)]]
      ]),
      learnersById: new Map([
        ['l_ok', learner('l_ok', 'Сдавший')],
        ['l_active', learner('l_active', 'Учащийся')],
        ['l_noexam', learner('l_noexam', 'Безэкзамена')],
        ['l_failed', learner('l_failed', 'Несдавший')],
        ['l_nosnils', learner('l_nosnils', 'Безснилса')]
      ]),
      learnerIssues: [snilsIssue('l_nosnils')]
    });

    expect(result.eligibleEnrollmentIds).toEqual(['e_ok']);
    expect(result.skipped.map((s) => [s.enrollmentId, s.code])).toEqual([
      ['e_active', 'enrollment_not_completed'],
      ['e_noexam', 'exam_result_missing'],
      ['e_failed', 'exam_not_passed'],
      ['e_nosnils', 'learner_issue']
    ]);
    // Отчёт зовёт людей по имени — оператору не нужно ходить по идентификаторам.
    expect(result.skipped.find((s) => s.enrollmentId === 'e_nosnils')?.fullName).toContain(
      'Безснилса'
    );
  });

  it('проблема слушателя из отчёта готовности отсеивает его ДО проверки экзамена', () => {
    // Слушатель без СНИЛС со сданным экзаменом всё равно отсеян: его удостоверение
    // не пройдёт в реестр, и выпускать его — плодить брак.
    const result = partitionChainCandidates({
      enrollments: [enrollment('e1', 'l1')],
      examResultsByEnrollmentId: new Map([['e1', [exam('e1', true)]]]),
      learnersById: new Map([['l1', learner('l1', 'Фамилия')]]),
      learnerIssues: [snilsIssue('l1')]
    });
    expect(result.eligibleEnrollmentIds).toEqual([]);
    expect(result.skipped[0]?.code).toBe('learner_issue');
  });

  it('несколько результатов экзамена: достаточно одного сданного', () => {
    const result = partitionChainCandidates({
      enrollments: [enrollment('e1', 'l1')],
      examResultsByEnrollmentId: new Map([['e1', [exam('e1', false), exam('e1', true)]]]),
      learnersById: new Map([['l1', learner('l1', 'Пересдавший')]]),
      learnerIssues: []
    });
    expect(result.eligibleEnrollmentIds).toEqual(['e1']);
    expect(result.skipped).toEqual([]);
  });

  it('пустая группа — пустой результат без ошибок', () => {
    const result = partitionChainCandidates({
      enrollments: [],
      examResultsByEnrollmentId: new Map(),
      learnersById: new Map(),
      learnerIssues: []
    });
    expect(result.eligibleEnrollmentIds).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
