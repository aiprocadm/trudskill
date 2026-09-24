import { describe, expect, it } from 'vitest';

import {
  MAX_LEARNER_EXTRA_FIELDS,
  extraFieldVariableCode,
  learnerExtraFieldsFrom,
  resolveExtraFieldVariables,
  resolveLearnerExtraFields,
  validateLearnerExtraFields
} from './learner-extra-fields.js';

/** Именованные поля личного дела (МГ-C1.3, РМ84–РМ86). */
describe('resolveLearnerExtraFields (РМ84)', () => {
  it('испорченные записи пропускаются, ключи приводятся к строчным, дубли — первая побеждает', () => {
    const defs = resolveLearnerExtraFields([
      { key: 'Otdel', label: 'Отдел', type: 'text' },
      { key: 'плохой ключ', label: 'Не пройдёт', type: 'text' },
      { key: 'start', label: 'Дата приёма', type: 'date' },
      { key: 'shift', label: 'Смена', type: 'list', options: ['дневная', 'ночная', ''] },
      { key: 'empty_list', label: 'Список без значений', type: 'list', options: [] },
      { key: 'otdel', label: 'Дубль', type: 'text' },
      { key: 'x', label: 'Тип не тот', type: 'xml' },
      'мусор',
      null
    ]);
    expect(defs).toEqual([
      { key: 'otdel', label: 'Отдел', type: 'text' },
      { key: 'start', label: 'Дата приёма', type: 'date' },
      { key: 'shift', label: 'Смена', type: 'list', options: ['дневная', 'ночная'] }
    ]);
  });

  it('не массив — пусто; лишние поля сверх лимита отбрасываются; читается из payload по ключу', () => {
    expect(resolveLearnerExtraFields({ key: 'a' })).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) => ({
      key: `f${i}`,
      label: `Поле ${i}`,
      type: 'text'
    }));
    expect(resolveLearnerExtraFields(many)).toHaveLength(MAX_LEARNER_EXTRA_FIELDS);
    expect(learnerExtraFieldsFrom({ learnerExtraFields: many.slice(0, 2) })).toHaveLength(2);
    expect(learnerExtraFieldsFrom(undefined)).toEqual([]);
  });
});

describe('validateLearnerExtraFields (РМ85)', () => {
  const defs = resolveLearnerExtraFields([
    { key: 'otdel', label: 'Отдел', type: 'text' },
    { key: 'start', label: 'Дата приёма', type: 'date' },
    { key: 'shift', label: 'Смена', type: 'list', options: ['дневная', 'ночная'] }
  ]);

  it('верные значения и пустые строки проходят', () => {
    expect(
      validateLearnerExtraFields(
        { otdel: 'Цех 2', start: '2026-03-01', shift: 'ночная', otdel2: '' },
        defs
      )
    ).toEqual([{ key: 'otdel2', message: expect.stringContaining('не описано') }]);
    expect(validateLearnerExtraFields({ otdel: '', start: '' }, defs)).toEqual([]);
  });

  it('дата не в ISO и значение вне списка — по-русски, с подсказкой что допустимо', () => {
    const problems = validateLearnerExtraFields({ start: '01.03.2026', shift: 'вечерняя' }, defs);
    expect(problems.map((p) => p.key)).toEqual(['start', 'shift']);
    expect(problems[0]?.message).toContain('ГГГГ-ММ-ДД');
    expect(problems[1]?.message).toContain('дневная, ночная');
  });
});

describe('переменные документов (РМ86)', () => {
  it('код строится из ключа; значения подставляются, отсутствующие — пустая строка', () => {
    expect(extraFieldVariableCode('otdel')).toBe('learner.extra.otdel');
    expect(
      resolveExtraFieldVariables({ otdel: 'Цех 2', n: 7 }, [
        'learner.extra.otdel',
        'learner.extra.n',
        'learner.extra.none',
        'learner.full_name'
      ])
    ).toEqual({ 'learner.extra.otdel': 'Цех 2', 'learner.extra.n': '7', 'learner.extra.none': '' });
  });
});
