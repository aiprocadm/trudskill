import { describe, expect, it } from 'vitest';

import {
  EMPTY_WIZARD_STATE,
  accessSummary,
  buildWizardRequest,
  canProceed,
  parseLearnerLines,
  shouldRotateKey,
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
