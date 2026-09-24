import { describe, expect, it } from 'vitest';

import { resolveCourseExtraVariables, resolveCourseVariables } from './entity-variables.js';
import {
  classifyPlaceholders,
  courseExtraVariableEntry,
  demoVariables
} from './variable-catalog.js';

import type { Course } from '../mvp/mvp.types.js';

const course = (extra: Partial<Course> = {}): Course => ({
  id: 'c1',
  tenantId: 't',
  code: 'R13.Б',
  title: 'ОТ Б',
  isArchived: false,
  status: 'published',
  createdAt: '',
  updatedAt: '',
  ...extra
});

describe('переменные документов курса (МГ-E2.1, срез 16.2)', () => {
  it('«представление» — из курса, а не задано — название курса, не пустое место', () => {
    expect(
      resolveCourseVariables(
        { course: course({ presentationTitle: 'Обучение по охране труда по программе Б' }) },
        ['course.presentation_title']
      )
    ).toEqual({ 'course.presentation_title': 'Обучение по охране труда по программе Б' });
    expect(resolveCourseVariables({ course: course() }, ['course.presentation_title'])).toEqual({
      'course.presentation_title': 'ОТ Б'
    });
    expect(demoVariables()['course.presentation_title']).toBeTruthy();
  });

  it('именованные поля курса подставляются по ключам самого курса', () => {
    expect(
      resolveCourseExtraVariables(
        course({
          docExtraFields: [
            { key: 'qualification', label: 'Присвоена квалификация', value: 'Электромонтёр' },
            { key: 'rank', label: 'Разряд', value: '3' }
          ]
        })
      )
    ).toEqual({ 'course.extra.qualification': 'Электромонтёр', 'course.extra.rank': '3' });
    expect(resolveCourseExtraVariables(undefined)).toEqual({});
  });

  it('проверка бланка: правильный ключ `course.extra.*` — известен, кривой — нет', () => {
    const { known, unknown } = classifyPlaceholders([
      'course.extra.rank',
      'course.extra.Разряд',
      'course.presentation_title'
    ]);
    expect(known.map((k) => k.code)).toEqual(['course.extra.rank', 'course.presentation_title']);
    expect(unknown).toEqual(['course.extra.Разряд']);
    expect(courseExtraVariableEntry('course.extra.rank')?.category).toBe('course');
    expect(courseExtraVariableEntry('course.title')).toBeUndefined();
  });
});
