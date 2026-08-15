import { describe, expect, it } from 'vitest';

import { MATERIAL_TYPE_LABELS, materialTypeLabel, publishBlockers, viewTimeLabel } from './labels';

describe('подписи карточки курса (TXT-006)', () => {
  it('вид материала — словом, а не кодом в скобках', () => {
    expect(materialTypeLabel('external_url')).toBe('Внешняя ссылка');
    expect(materialTypeLabel('scorm')).toBe('Пакет SCORM');
  });

  it('незнакомый вид показывается как есть, а не исчезает', () => {
    expect(materialTypeLabel('подкаст')).toBe('подкаст');
  });

  it('ни одна подпись не написана латиницей (кроме имени стандарта)', () => {
    const foreign = Object.values(MATERIAL_TYPE_LABELS).filter(
      (label) => !/[А-Яа-яЁё]/.test(label)
    );
    expect(foreign).toEqual([]);
  });
});

describe('время просмотра человеку', () => {
  it('вместо «min_view_seconds=60» — минуты', () => {
    expect(viewTimeLabel(60)).toBe('1 мин');
    expect(viewTimeLabel(150)).toBe('2 мин 30 с');
  });

  it('меньше минуты остаётся секундами', () => {
    expect(viewTimeLabel(45)).toBe('45 с');
  });

  it('ноль означает «без ограничения», а не «0 секунд»', () => {
    // Так задаются пакеты SCORM: время считает сам пакет.
    expect(viewTimeLabel(0)).toBe('без ограничения');
    expect(viewTimeLabel(undefined)).toBe('без ограничения');
  });
});

describe('что мешает опубликовать курс', () => {
  it('перечисляет ровно недостающее, а не общую фразу', () => {
    expect(publishBlockers({ hasVersion: true, hasModule: false, hasMaterial: false })).toEqual([
      'в версии нет ни одного модуля',
      'в модуле нет ни одного материала'
    ]);
  });

  it('готовый курс не имеет препятствий', () => {
    expect(publishBlockers({ hasVersion: true, hasModule: true, hasMaterial: true })).toEqual([]);
  });

  it('пустой курс перечисляет все три причины', () => {
    expect(
      publishBlockers({ hasVersion: false, hasModule: false, hasMaterial: false })
    ).toHaveLength(3);
  });
});
