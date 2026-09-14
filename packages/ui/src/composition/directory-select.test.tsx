import { describe, expect, it } from 'vitest';

import { DirectorySelect } from './directory-select.js';
import { SelectField } from './select-field.js';
import { SearchInput } from '../components/search/index.js';
import { handlerOf, propsOf } from '../testing/element.test-util.js';

import type { SelectFieldOption } from './select-field.js';

/**
 * Выбор из справочника не врёт о том, что показывает (журнал 392).
 *
 * Выпадающие списки выбора грузили одну страницу записей и показывали её целиком: слушателей
 * просили сто, заказчиков тысячу (сервер отдаёт не больше двухсот с проволоки — потолок
 * осознан, журнал 277). Поиска внутри списка не было, признака «показаны не все» — тоже.
 * Центру с тремя сотнями слушателей выбор молча врал: человека нет в списке, карточка его
 * на месте, и понять почему невозможно.
 *
 * Здесь собраны три обещания сразу: искать на сервере, честно называть числа и не терять
 * уже выбранное.
 */

const OPTIONS: SelectFieldOption[] = [
  { value: 'l_1', label: 'Иванов Иван' },
  { value: 'l_2', label: 'Петров Пётр' }
];

const find = (node: unknown, type: unknown): unknown => {
  if (node === null || typeof node !== 'object') return null;
  const element = node as { type?: unknown; props?: { children?: unknown } };
  if (element.type === type) return node;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
};

const render = (overrides: Record<string, unknown> = {}) =>
  DirectorySelect({
    label: 'Слушатель',
    value: '',
    onChange: () => undefined,
    options: OPTIONS,
    total: OPTIONS.length,
    query: '',
    onQueryChange: () => undefined,
    ...overrides
  } as Parameters<typeof DirectorySelect>[0]);

describe('DirectorySelect — выбор из справочника', () => {
  it('рядом со списком есть поиск, и введённое уходит наружу', () => {
    const typed: string[] = [];
    const element = render({ onQueryChange: (value: string) => typed.push(value) });
    const search = find(element, SearchInput);
    expect(search, 'поиск рядом со списком обязателен — иначе искать нечем').not.toBeNull();
    handlerOf(search, 'onChange')('Петр');
    expect(typed).toEqual(['Петр']);
  });

  it('показано меньше, чем есть у сервера — список называет оба числа', () => {
    const select = find(render({ total: 340 }), SelectField);
    const hint = String(propsOf(select).hint ?? '');
    expect(hint).toContain('2');
    expect(hint).toContain('340');
  });

  it('показано всё — про уточнение запроса не говорит', () => {
    const select = find(render({ total: 2 }), SelectField);
    expect(String(propsOf(select).hint ?? '')).not.toContain('340');
    expect(String(propsOf(select).hint ?? '')).not.toContain('Уточните');
  });

  it('выбранное не теряется, даже если его нет среди показанных', () => {
    /*
     * `<select>` с неизвестным значением молча показывает ПЕРВЫЙ пункт — на этом уже
     * обожглись с часовым поясом центра. Поэтому выбранной записи, выпавшей из показанных,
     * заводится собственный пункт.
     */
    const select = find(render({ value: 'l_9', selectedLabel: 'Сидоров Семён' }), SelectField);
    const options = propsOf(select).options as SelectFieldOption[];
    expect(options.some((o) => o.value === 'l_9' && o.label === 'Сидоров Семён')).toBe(true);
  });

  it('поиск ничего не нашёл — сказано словами, а не пустотой', () => {
    const select = find(render({ options: [], total: 0, query: 'абырвалг' }), SelectField);
    expect(String(propsOf(select).hint ?? '')).toContain('Ничего не найдено');
  });

  it('справочник пуст вовсе — своя подсказка, а не «ничего не найдено»', () => {
    const select = find(
      render({ options: [], total: 0, query: '', emptyHint: 'Слушателей пока нет' }),
      SelectField
    );
    expect(String(propsOf(select).hint ?? '')).toContain('Слушателей пока нет');
  });
});
