import { describe, expect, it } from 'vitest';

import { resolveVisibleColumns, toggleColumn } from './column-config.js';

const ALL = ['name', 'email', 'snils', 'status'];

describe('настройка колонок реестра (CMP-002)', () => {
  it('без настройки показываются все колонки', () => {
    expect(resolveVisibleColumns(ALL, undefined)).toEqual(ALL);
  });

  it('пустой список видимых колонок показывает все, а не пустую таблицу', () => {
    // Защита от испорченного сохранения: пользователь не должен увидеть реестр без колонок.
    expect(resolveVisibleColumns(ALL, [])).toEqual(ALL);
  });

  it('порядок колонок берётся из объявления, а не из сохранённого набора', () => {
    expect(resolveVisibleColumns(ALL, ['status', 'name'])).toEqual(['name', 'status']);
  });

  it('первая колонка показывается всегда — по ней узнают строку', () => {
    expect(resolveVisibleColumns(ALL, ['email'])).toEqual(['name', 'email']);
  });

  it('неизвестный ключ из сохранения игнорируется', () => {
    expect(resolveVisibleColumns(ALL, ['name', 'удалённая-колонка'])).toEqual(['name']);
  });

  it('toggleColumn скрывает и возвращает колонку', () => {
    expect(toggleColumn(ALL, ALL, 'email')).toEqual(['name', 'snils', 'status']);
    expect(toggleColumn(ALL, ['name', 'snils', 'status'], 'email')).toEqual(ALL);
  });

  it('toggleColumn не даёт скрыть первую колонку', () => {
    expect(toggleColumn(ALL, ALL, 'name')).toEqual(ALL);
  });

  it('toggleColumn не даёт скрыть последнюю оставшуюся колонку', () => {
    expect(toggleColumn(ALL, ['name'], 'name')).toEqual(['name']);
  });
});
