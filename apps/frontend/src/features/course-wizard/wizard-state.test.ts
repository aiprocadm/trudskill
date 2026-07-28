import { describe, expect, it } from 'vitest';

import {
  WIZARD_STEPS,
  buildCreationPlan,
  canJumpTo,
  emptyDraft,
  nextStep,
  prevStep,
  validateAll,
  validateStep
} from './wizard-state';

import type { CourseWizardDraft } from './wizard-state';

/** Мастер создания курса (ФТ-E1, Фаза 2 Task 11b). */

const filled = (over: Partial<CourseWizardDraft> = {}): CourseWizardDraft => ({
  ...emptyDraft(),
  code: 'OT-40',
  title: 'Охрана труда, 40 часов',
  academicHours: '40',
  modules: [
    {
      title: 'Модуль 1',
      isRequired: true,
      materials: [
        { title: 'Вводное видео', materialType: 'video', minViewSeconds: 0, isRequired: true }
      ]
    }
  ],
  ...over
});

describe('validateStep — проверяем только текущий шаг', () => {
  it('пустая карточка не пускает дальше', () => {
    const errors = validateStep('card', emptyDraft());
    expect(errors.map((e) => e.field)).toEqual(['code', 'title']);
  });

  it('незаполненные часы не мешают ввести название — мастер не анкета', () => {
    expect(validateStep('card', filled({ academicHours: '' }))).toEqual([]);
  });

  it('часы проверяются только если введены', () => {
    expect(validateStep('program', filled({ academicHours: '' }))).toEqual([]);
    expect(validateStep('program', filled({ academicHours: '40' }))).toEqual([]);
    expect(validateStep('program', filled({ academicHours: '-5' }))).toHaveLength(1);
    expect(validateStep('program', filled({ academicHours: 'сорок' }))).toHaveLength(1);
  });

  it('курс без модулей не собирается', () => {
    const errors = validateStep('structure', filled({ modules: [] }));
    expect(errors[0]?.field).toBe('modules');
  });

  it('короткие названия модуля и материала называются с номерами', () => {
    const errors = validateStep(
      'structure',
      filled({
        modules: [
          {
            title: 'М',
            isRequired: true,
            materials: [{ title: 'x', materialType: 'text', minViewSeconds: 0, isRequired: true }]
          }
        ]
      })
    );
    expect(errors.map((e) => e.field)).toEqual(['modules.0.title', 'modules.0.materials.0.title']);
    expect(errors[0]!.message).toContain('Модуль 1');
  });

  it('порог зачёта видео проверяется по границам', () => {
    expect(validateStep('rules', filled({ videoCompletionPercent: '90' }))).toEqual([]);
    expect(validateStep('rules', filled({ videoCompletionPercent: '' }))).toEqual([]);
    expect(validateStep('rules', filled({ videoCompletionPercent: '0' }))).toHaveLength(1);
    expect(validateStep('rules', filled({ videoCompletionPercent: '101' }))).toHaveLength(1);
  });

  it('ЛОВУШКА: строгий порядок без обязательных материалов запер бы курс', () => {
    // Пройти в первом модуле нечего → второй не откроется никогда.
    const errors = validateStep(
      'rules',
      filled({
        sequentialModules: true,
        modules: [
          {
            title: 'Модуль 1',
            isRequired: true,
            materials: [
              { title: 'Методичка', materialType: 'file', minViewSeconds: 0, isRequired: false }
            ]
          }
        ]
      })
    );
    expect(errors[0]?.field).toBe('sequentialModules');
    expect(errors[0]?.message).toContain('не откроется');
  });

  it('строгий порядок с обязательным материалом проходит', () => {
    expect(validateStep('rules', filled({ sequentialModules: true }))).toEqual([]);
  });
});

describe('навигация по шагам', () => {
  it('вперёд пускает только с заполненного шага', () => {
    expect(nextStep('card', emptyDraft())).toBe('card');
    expect(nextStep('card', filled())).toBe('program');
  });

  it('назад пускает всегда — поправить введённое не ошибка', () => {
    expect(prevStep('structure')).toBe('program');
    expect(prevStep('card')).toBe('card');
  });

  it('последний шаг не уводит за пределы мастера', () => {
    expect(nextStep('review', filled())).toBe('review');
  });

  it('по степперу можно вернуться назад, но не перепрыгнуть вперёд', () => {
    expect(canJumpTo('card', 'structure')).toBe(true);
    expect(canJumpTo('structure', 'structure')).toBe(true);
    expect(canJumpTo('review', 'structure')).toBe(false);
  });

  it('шаг «Проверка» собирает ошибки со всех шагов', () => {
    const errors = validateAll(emptyDraft());
    expect(errors.map((e) => e.field)).toContain('code');
    expect(errors.map((e) => e.field)).toContain('modules');
  });

  it('заполненный черновик не даёт ошибок на проверке', () => {
    expect(validateAll(filled())).toEqual([]);
  });

  it('шагов пять и «Проверка» — последний', () => {
    expect(WIZARD_STEPS).toHaveLength(5);
    expect(WIZARD_STEPS.at(-1)).toBe('review');
  });
});

describe('buildCreationPlan — что уйдёт на сервер', () => {
  it('порядок модулей и материалов берётся из черновика', () => {
    const plan = buildCreationPlan(
      filled({
        modules: [
          { title: 'Второй', isRequired: true, materials: [] },
          {
            title: 'Первый',
            isRequired: false,
            materials: [
              { title: 'A', materialType: 'text', minViewSeconds: 0, isRequired: true },
              { title: 'B', materialType: 'video', minViewSeconds: 60, isRequired: false }
            ]
          }
        ]
      })
    );

    // Мастер НЕ пересортировывает: от порядка зависит строгий порядок модулей (ФТ-E1).
    expect(plan.modules.map((m) => [m.title, m.sortOrder])).toEqual([
      ['Второй', 0],
      ['Первый', 1]
    ]);
    expect(plan.modules[1]!.materials.map((m) => m.sortOrder)).toEqual([0, 1]);
  });

  it('пустые необязательные поля уходят как null, а не пустой строкой', () => {
    const plan = buildCreationPlan(filled({ academicHours: '', videoCompletionPercent: '' }));
    expect(plan.programMeta.academicHours).toBeNull();
    expect(plan.programMeta.videoCompletionPercent).toBeNull();
    expect(plan.programMeta.trainingType).toBeNull();
  });

  it('часы и порог переводятся в числа', () => {
    const plan = buildCreationPlan(filled({ academicHours: '40', videoCompletionPercent: '85' }));
    expect(plan.programMeta.academicHours).toBe(40);
    expect(plan.programMeta.videoCompletionPercent).toBe(85);
  });

  it('пробелы в названиях обрезаются — иначе курс называется « Охрана труда »', () => {
    const plan = buildCreationPlan(filled({ code: '  OT-40 ', title: '  Курс  ' }));
    expect(plan.course.code).toBe('OT-40');
    expect(plan.course.title).toBe('Курс');
  });

  it('отрицательное минимальное время не уходит на сервер', () => {
    const plan = buildCreationPlan(
      filled({
        modules: [
          {
            title: 'М',
            isRequired: true,
            materials: [
              { title: 'X', materialType: 'video', minViewSeconds: -10, isRequired: true }
            ]
          }
        ]
      })
    );
    expect(plan.modules[0]!.materials[0]!.minViewSeconds).toBe(0);
  });

  it('направление не отправляется, если не выбрано', () => {
    expect(buildCreationPlan(filled()).course.directionId).toBeUndefined();
    expect(buildCreationPlan(filled({ directionId: 'dir_1' })).course.directionId).toBe('dir_1');
  });
});
