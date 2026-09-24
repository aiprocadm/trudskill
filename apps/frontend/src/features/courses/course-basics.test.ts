import { describe, expect, it } from 'vitest';

import {
  buildCoursePayload,
  courseBasicsProblem,
  courseBasicsRows,
  parseNumberField,
  toCourseBasicsForm
} from './course-basics';

import type { Course } from '../mvp/types';

const course = (extra: Partial<Course> = {}): Course => ({
  id: 'c1',
  tenantId: 't',
  code: '13.Б',
  title: 'ОТ Б',
  isArchived: false,
  status: 'published',
  createdAt: '',
  updatedAt: '',
  ...extra
});

describe('«Основное» курса (МГ-E2.1, срез 16.3)', () => {
  it('форма → тело: пустое — null, числа по-русски, пустые части номера отброшены', () => {
    const form = {
      ...toCourseBasicsForm(course()),
      price: '2 500,50',
      periodDaysDefault: '36',
      certificateNumberParts: ['14', '', 'ОТ'] as [string, string, string],
      docExtraFields: [{ key: 'rank', label: ' Разряд ', value: ' 3 ' }]
    };
    expect(buildCoursePayload(form)).toMatchObject({
      code: '13.Б',
      directionId: null,
      presentationTitle: null,
      price: 2500.5,
      periodDaysDefault: 36,
      sortNo: null,
      certificateNumberParts: ['14', 'ОТ'],
      docExtraFields: [{ key: 'rank', label: 'Разряд', value: '3' }]
    });
    expect(parseNumberField('')).toBeNull();
    expect(parseNumberField('abc')).toBeUndefined();
  });

  it('причина, почему нельзя сохранить: не число, кривой или повторённый ключ, поле без подписи', () => {
    const base = toCourseBasicsForm(course());
    expect(courseBasicsProblem(base)).toBeNull();
    expect(courseBasicsProblem({ ...base, price: 'дорого' })).toBe('Цена — нужно число.');
    expect(
      courseBasicsProblem({
        ...base,
        docExtraFields: [{ key: 'Разряд', label: 'Разряд', value: '' }]
      })
    ).toMatch(/латиница/);
    expect(
      courseBasicsProblem({
        ...base,
        docExtraFields: [
          { key: 'rank', label: 'Разряд', value: '' },
          { key: 'rank', label: 'Разряд 2', value: '' }
        ]
      })
    ).toBe('Ключ «rank» указан дважды.');
    expect(courseBasicsProblem({ ...base, title: ' ' })).toBe('Укажите код и название курса.');
  });

  it('строки карточки — словами, только заполненное', () => {
    const rows = courseBasicsRows(
      course({
        presentationTitle: 'Обучение по охране труда',
        periodDaysDefault: 36,
        frdoDocumentKind: 'PK',
        responsibleUserId: 'u1',
        docExtraFields: [{ key: 'rank', label: 'Разряд', value: '3' }]
      }),
      {
        direction: 'Охрана труда',
        responsible: 'Петрова Анна',
        frdoKinds: [
          {
            code: 'PK',
            templateType: 'certificate',
            frdoKind: 'Удостоверение о повышении квалификации',
            educationLevel: 'ДПО',
            exactName: '',
            isActive: true
          }
        ]
      }
    );
    expect(rows).toEqual([
      { label: 'Код', value: '13.Б' },
      { label: 'Направление', value: 'Охрана труда' },
      { label: 'Для документов', value: 'Обучение по охране труда' },
      { label: 'Срок обучения', value: '36 дн.' },
      { label: 'Вид документа ФИС ФРДО', value: 'Удостоверение о повышении квалификации' },
      { label: 'Ответственный', value: 'Петрова Анна' },
      { label: 'Разряд', value: '3' }
    ]);
  });
});
