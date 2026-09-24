import { describe, expect, it } from 'vitest';

import {
  EMPTY_WIZARD_STATE,
  accessSummary,
  addDaysIso,
  buildWizardRequest,
  canProceed,
  copyStateFrom,
  daysBetweenIso,
  parseLearnerLines,
  shouldRotateKey,
  todayLocalIso,
  wizardOutcomeSummary
} from './group-wizard-model';

import type { GroupWizardOutcome } from '../../mvp/types';

const filled = () => ({
  ...EMPTY_WIZARD_STATE,
  name: 'Охрана труда, октябрь',
  courseIds: ['c1', 'c2'],
  startDate: '2026-10-05',
  existingLearnerIds: ['l-existing'],
  learnerText: 'Иванов Иван Иванович; инженер; 112-233-445 95; ivan@x.ru\n\nПетров Пётр\tмастер'
});

const outcomeOf = (
  rows: GroupWizardOutcome['enrollments']['rows'],
  access: Partial<GroupWizardOutcome['access']> = {}
) =>
  ({
    idempotencyKey: 'k',
    group: { id: 'g1' },
    coursesAssigned: 1,
    enrollments: {
      total: rows.length,
      created: 0,
      reused: 0,
      failed: rows.filter((row) => row.status === 'failed').length,
      rows
    },
    access: { mode: 'email', sent: 0, sheetFileId: null, deferred: false, ...access }
  }) as GroupWizardOutcome;

describe('parseLearnerLines', () => {
  it('режет по «;» и табуляции, пустые строки пропускает, номер — физический номер строки', () => {
    const rows = parseLearnerLines(filled().learnerText);
    expect(rows).toEqual([
      {
        rowNumber: 1,
        fullName: 'Иванов Иван Иванович',
        position: 'инженер',
        snils: '112-233-445 95',
        email: 'ivan@x.ru'
      },
      { rowNumber: 3, fullName: 'Петров Пётр', position: 'мастер' }
    ]);
  });

  it('строка-заголовок уходит на сервер как обычная строка — отказ придёт строкой, пачку не сломает', () => {
    const rows = parseLearnerLines('ФИО; Должность; СНИЛС\nСидоров Сидор');
    expect(rows.map((row) => row.fullName)).toEqual(['ФИО', 'Сидоров Сидор']);
  });
});

describe('canProceed', () => {
  it('шаг 1 требует название, шаг 2 — хотя бы один курс и порядок дат', () => {
    expect(canProceed('who', EMPTY_WIZARD_STATE)).toMatchObject({ ok: false });
    expect(canProceed('who', filled())).toEqual({ ok: true });
    expect(canProceed('what', { ...filled(), courseIds: [] })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('курс')
    });
    expect(canProceed('what', { ...filled(), endDate: '2026-10-01' })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Окончание')
    });
    expect(canProceed('what', filled())).toEqual({ ok: true });
    expect(canProceed('learners', EMPTY_WIZARD_STATE)).toEqual({ ok: true });
  });
});

describe('buildWizardRequest', () => {
  it('собирает тело в форме DTO сервера: ключ, группа с черновиком, курсы, слушатели, доступы', () => {
    const request = buildWizardRequest(
      { ...filled(), draftId: 'g-draft', accessMode: 'later' },
      'key-1',
      'u-me'
    );
    expect(request).toEqual({
      idempotencyKey: 'key-1',
      group: {
        name: 'Охрана труда, октябрь',
        startDate: '2026-10-05',
        responsibleUserId: 'u-me',
        draftId: 'g-draft'
      },
      courses: [{ courseId: 'c1' }, { courseId: 'c2' }],
      learners: {
        existingIds: ['l-existing'],
        rows: [
          {
            rowNumber: 1,
            fullName: 'Иванов Иван Иванович',
            position: 'инженер',
            snils: '112-233-445 95',
            email: 'ivan@x.ru'
          },
          { rowNumber: 3, fullName: 'Петров Пётр', position: 'мастер' }
        ]
      },
      access: { mode: 'later' }
    });
  });

  it('без слушателей поле learners не отправляется; повторный вызов с тем же ключом даёт то же тело', () => {
    const state = { ...filled(), existingLearnerIds: [], learnerText: '' };
    const first = buildWizardRequest(state, 'same', 'u');
    expect(first).not.toHaveProperty('learners');
    expect(buildWizardRequest(state, 'same', 'u')).toEqual(first);
  });
});

describe('copyStateFrom (МГ-B6.1)', () => {
  const group = {
    id: 'g-src',
    name: 'Охрана труда, сентябрь',
    counterpartyId: 'cp-1',
    comment: 'по договору 12',
    startDate: '2026-08-20',
    endDate: '2026-09-03',
    examDate: '2026-09-03',
    studyForm: 'distance'
  };

  it('даты сдвигаются на «сегодня − начало»: начало = сегодня, длительность сохраняется', () => {
    const state = copyStateFrom(
      { group, courseIds: ['c1', 'c1', 'c2'], enrollments: [] },
      '2026-09-24'
    );
    expect(state).toMatchObject({
      copyOfGroupId: 'g-src',
      name: 'Охрана труда, сентябрь (копия)',
      code: '',
      counterpartyId: 'cp-1',
      comment: 'по договору 12',
      courseIds: ['c1', 'c2'],
      startDate: '2026-09-24',
      endDate: '2026-10-08',
      examDate: '2026-10-08',
      studyForm: 'distance',
      accessMode: 'later',
      draftId: null
    });
  });

  it('без начала у исходной — даты копии пустые, не «Invalid Date»', () => {
    const state = copyStateFrom(
      {
        group: { ...group, startDate: undefined, endDate: '2026-09-03' } as unknown as typeof group,
        courseIds: [],
        enrollments: []
      },
      '2026-09-24'
    );
    expect(state.startDate).toBe('');
    expect(state.endDate).toBe('');
    expect(state.examDate).toBe('');
  });

  it('слушатели: отменённые зачисления не копируются, повторы схлопываются', () => {
    const state = copyStateFrom(
      {
        group,
        courseIds: [],
        enrollments: [
          { learnerId: 'l1', status: 'active' },
          { learnerId: 'l2', status: 'cancelled' },
          { learnerId: 'l1', status: 'completed' },
          { learnerId: 'l3', status: 'pending' }
        ]
      },
      '2026-09-24'
    );
    expect(state.existingLearnerIds).toEqual(['l1', 'l3']);
    const request = buildWizardRequest({ ...state, courseIds: ['c1'] }, 'k', 'u');
    expect(request.copyOfGroupId).toBe('g-src');
    expect(request.learners).toEqual({ existingIds: ['l1', 'l3'] });
  });

  it('арифметика дат: високосный февраль и переход через год', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetweenIso('2026-08-20', '2026-09-24')).toBe(35);
    expect(daysBetweenIso('2026-09-24', '2026-08-20')).toBe(-35);
    expect(todayLocalIso(new Date(2026, 8, 24, 23, 30))).toBe('2026-09-24');
  });
});

describe('shouldRotateKey', () => {
  it('ключ меняется только после 4xx: сеть и 5xx оставляют прежний', () => {
    expect(shouldRotateKey({ status: 400 })).toBe(true);
    expect(shouldRotateKey({ status: 409 })).toBe(true);
    expect(shouldRotateKey({ status: 500 })).toBe(false);
    expect(shouldRotateKey(new Error('Failed to fetch'))).toBe(false);
    expect(shouldRotateKey(null)).toBe(false);
  });
});

describe('сводка результата', () => {
  const names = {
    byRow: new Map([[3, 'Петров Пётр']]),
    byLearner: new Map([['l-existing', 'Кузнецова Анна']])
  };

  it('успех — всё, что не failed; отказ подписан именем и номером строки, причина — с сервера', () => {
    const summary = wizardOutcomeSummary(
      outcomeOf([
        { rowNumber: 0, status: 'reused', learnerId: 'l-existing' },
        { rowNumber: 1, status: 'created', learnerId: 'l1' },
        {
          rowNumber: 3,
          status: 'failed',
          errorCode: 'snils_invalid',
          errorMessage: 'СНИЛС не проходит проверку.'
        },
        { rowNumber: 5, status: 'failed', errorCode: 'fullname_invalid' }
      ]),
      names
    );
    expect(summary).toEqual({
      total: 4,
      succeeded: 2,
      failures: [
        { label: 'Петров Пётр (строка 3)', reason: 'СНИЛС не проходит проверку.' },
        { label: 'Строка 5', reason: 'Сервер отклонил строку, причина не указана' }
      ]
    });
  });

  it('фраза о доступах зависит от способа и от того, у скольких есть почта', () => {
    const two = [
      { rowNumber: 1, status: 'created' as const },
      { rowNumber: 2, status: 'created' as const }
    ];
    expect(accessSummary(outcomeOf(two, { sent: 2 }))).toContain('всем: 2');
    expect(accessSummary(outcomeOf(two, { sent: 1 }))).toContain('1 из 2');
    expect(accessSummary(outcomeOf(two, { sent: 0 }))).toContain('нет почты');
    expect(accessSummary(outcomeOf([], { sent: 0 }))).toContain('некому');
    expect(accessSummary(outcomeOf(two, { mode: 'later', deferred: true }))).toContain(
      'карточки группы'
    );
    expect(accessSummary(outcomeOf(two, { mode: 'sheet', deferred: true }))).toContain(
      'Лист доступов'
    );
  });
});

describe('мастер: «из сотрудников компании» (МГ-D2.1, срез 14.4)', () => {
  it('сотрудники уходят в запрос только при выбранной компании; сводка подписывает их по ФИО', () => {
    const state = {
      ...EMPTY_WIZARD_STATE,
      name: 'Группа',
      courseIds: ['c1'],
      counterpartyId: 'cp_1',
      employeeIds: ['ce_1', 'ce_2'],
      employeeNames: { ce_1: 'Иванов Иван', ce_2: 'Орлов Олег' }
    };
    expect(buildWizardRequest(state, 'k1', 'u1').learners).toEqual({
      employeeIds: ['ce_1', 'ce_2']
    });
    expect(
      buildWizardRequest({ ...state, counterpartyId: '' }, 'k2', 'u1').learners
    ).toBeUndefined();

    const summary = wizardOutcomeSummary(
      {
        enrollments: {
          total: 2,
          created: 1,
          reused: 0,
          failed: 1,
          rows: [
            { rowNumber: 0, status: 'created', employeeId: 'ce_1', learnerId: 'l1' },
            {
              rowNumber: 0,
              status: 'failed',
              employeeId: 'ce_2',
              errorMessage:
                'Орлов Олег отмечен уволенным — верните его в работающие, чтобы зачислить.'
            }
          ]
        }
      } as unknown as GroupWizardOutcome,
      {
        byRow: new Map(),
        byLearner: new Map(),
        byEmployee: new Map(Object.entries(state.employeeNames))
      }
    );
    expect(summary).toEqual({
      total: 2,
      succeeded: 1,
      failures: [
        {
          label: 'Орлов Олег',
          reason: 'Орлов Олег отмечен уволенным — верните его в работающие, чтобы зачислить.'
        }
      ]
    });
  });
});
