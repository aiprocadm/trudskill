import { describe, expect, it } from 'vitest';

import {
  MAX_LEARNER_EXTRA_FIELDS,
  defFromRow,
  extraFieldVariableCode,
  learnerExtraFieldsFrom,
  parseLearnerExtraFields,
  rowFromDef,
  suggestExtraFieldKey,
  undescribedExtraFieldLabel,
  validateExtraFieldRows
} from './extra-fields';

/** Именованные поля личного дела на фронте (МГ-C1.3, срез 8.14b) — зеркало серверного разбора. */
describe('parseLearnerExtraFields (РМ84)', () => {
  it('испорченные записи пропускаются, ключи к строчным, дубли — первая, лимит', () => {
    expect(
      parseLearnerExtraFields([
        { key: 'Otdel', label: 'Отдел', type: 'text' },
        { key: 'плохой', label: 'Нет', type: 'text' },
        { key: 'shift', label: 'Смена', type: 'list', options: ['дневная', ''] },
        { key: 'empty', label: 'Пустой список', type: 'list', options: [] },
        { key: 'otdel', label: 'Дубль', type: 'text' },
        'мусор'
      ])
    ).toEqual([
      { key: 'otdel', label: 'Отдел', type: 'text' },
      { key: 'shift', label: 'Смена', type: 'list', options: ['дневная'] }
    ]);
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `f${i}`, label: 'П', type: 'date' }));
    expect(parseLearnerExtraFields(many)).toHaveLength(MAX_LEARNER_EXTRA_FIELDS);
    expect(learnerExtraFieldsFrom({ learnerExtraFields: many.slice(0, 1) })).toHaveLength(1);
    expect(learnerExtraFieldsFrom(undefined)).toEqual([]);
  });
});

describe('suggestExtraFieldKey (РМ88)', () => {
  it('подпись по-русски превращается в латинское имя переменной; с цифры — префикс', () => {
    expect(suggestExtraFieldKey('Дата приёма')).toBe('data_priema');
    expect(suggestExtraFieldKey('  Табельный № 7 ')).toBe('tabelnyj_7');
    expect(suggestExtraFieldKey('1-я смена')).toBe('f_1_ya_smena');
    expect(suggestExtraFieldKey('')).toBe('');
    expect(extraFieldVariableCode('otdel')).toBe('learner.extra.otdel');
  });
});

describe('validateExtraFieldRows и строки редактора', () => {
  it('дубли, плохое имя, пустая подпись и список без вариантов названы по номеру строки', () => {
    const problems = validateExtraFieldRows([
      { key: 'otdel', label: 'Отдел', type: 'text', options: '' },
      { key: 'Otdel', label: '', type: 'text', options: '' },
      { key: 'плохой ключ', label: 'Х', type: 'text', options: '' },
      { key: 'shift', label: 'Смена', type: 'list', options: ' , ' }
    ]);
    expect(problems).toEqual([
      expect.stringContaining('Поле 2: укажите подпись'),
      expect.stringContaining('Поле 2: имя «otdel» уже занято полем 1'),
      expect.stringContaining('Поле 3: имя для документов'),
      expect.stringContaining('Поле 4: для выбора из списка')
    ]);
    expect(
      validateExtraFieldRows([
        { key: 'shift', label: 'Смена', type: 'list', options: 'день; ночь' }
      ])
    ).toEqual([]);
  });

  it('строка ↔ описание: варианты списка — строкой через запятую и обратно', () => {
    const def = { key: 'shift', label: 'Смена', type: 'list' as const, options: ['день', 'ночь'] };
    const row = rowFromDef(def);
    expect(row.options).toBe('день, ночь');
    expect(defFromRow({ ...row, key: ' Shift ' })).toEqual(def);
    expect(defFromRow({ key: 'otdel', label: 'Отдел', type: 'text', options: 'мусор' })).toEqual({
      key: 'otdel',
      label: 'Отдел',
      type: 'text'
    });
  });

  it('ключ без описания подписывается по-русски, не сырым кодом (РМ89)', () => {
    expect(undescribedExtraFieldLabel('legacy_3')).toBe('Дополнительная строка 3 (из CDOPROF)');
    expect(undescribedExtraFieldLabel('old_key')).toBe('Поле без описания «old_key»');
  });
});
