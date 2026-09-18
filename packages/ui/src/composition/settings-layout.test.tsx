import { describe, expect, it, vi } from 'vitest';

import { SettingsLayout, isEmbeddedSection, settingsSectionTarget } from './settings-layout.js';
import { propsOf } from '../testing/element.test-util.js';

const SECTIONS = [
  { id: 'payments', title: 'Оплата', hint: 'Платёжный провайдер центра' },
  { id: 'users', title: 'Люди и доступ', hint: 'Сотрудники центра', href: '/users' }
];

const Stub = () => null;

const render = (activeId?: string, onSelect?: (id: string) => void) =>
  SettingsLayout({
    sections: SECTIONS,
    link: Stub,
    children: 'СОДЕРЖИМОЕ',
    ...(activeId === undefined ? {} : { activeId }),
    ...(onSelect === undefined ? {} : { onSelect })
  });

/** Первый потомок с нужным классом на любой глубине дерева. */
const find = (node: unknown, className: string): any => {
  if (node === null || typeof node !== 'object') return null;
  const element = node as any;
  if (element.props?.className === className) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
};

/** Все узлы с нужным классом — списков оглавления теперь два. */
const findAll = (node: unknown, className: string, acc: any[] = []): any[] => {
  if (node === null || typeof node !== 'object') return acc;
  const element = node as any;
  if (element.props?.className === className) acc.push(element);
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    findAll(child, className, acc);
  }
  return acc;
};

describe('SettingsLayout — раскладка настроек (TPL-005, ТЗ 5.7)', () => {
  it('оглавление и содержимое — два разных места', () => {
    const el = render();
    expect(propsOf(el).className).toBe('ui-settings');
    expect(find(el, 'ui-settings__nav')?.type).toBe('nav');
    expect(find(el, 'ui-settings__body')?.props.children).toBe('СОДЕРЖИМОЕ');
  });

  it('встроенный раздел — КНОПКА, свой маршрут — ссылка приложения', () => {
    /*
     * ТЗ 5.7 (Э7): по виду они были неотличимы, и предсказать результат клика человек не мог.
     * Кнопка ничего не обещает, кроме смены содержимого справа; ссылка обещает переход.
     */
    const [embedded, external] = findAll(render(), 'ui-settings-toc');
    expect(embedded.props.children[0].props.children.type).toBe('button');
    expect(external.props.children[0].props.children.type).toBe(Stub);
    expect(external.props.children[0].props.children.props.href).toBe('/users');
  });

  it('группы названы словами: «Настроить здесь» и «Открыть отдельный раздел»', () => {
    const groups = findAll(render(), 'ui-settings-toc__group').map((node) => node.props.children);
    expect(groups).toEqual(['Настроить здесь', 'Открыть отдельный раздел']);
  });

  it('выбор встроенного раздела уходит наружу — адрес пишет экран', () => {
    const onSelect = vi.fn();
    const [embedded] = findAll(render('payments', onSelect), 'ui-settings-toc');
    embedded.props.children[0].props.children.props.onClick();
    expect(onSelect).toHaveBeenCalledWith('payments');
  });

  it('открытый раздел отмечен для чтения с экрана и для глаза', () => {
    const [embedded] = findAll(render('payments'), 'ui-settings-toc');
    expect(embedded.props.children[0].props.children.props['aria-current']).toBe('true');
  });

  it('на телефоне те же разделы есть выпадающим списком, разложенные по группам', () => {
    const select = find(render('payments'), 'ui-select');
    expect(select.props.value).toBe('?tab=payments');
    const groups = select.props.children.filter((node: any) => node?.type === 'optgroup');
    expect(groups.map((group: any) => group.props.label)).toEqual([
      'Настроить здесь',
      'Открыть отдельный раздел'
    ]);
  });

  it('выбор встроенного раздела в списке НЕ перезагружает страницу', () => {
    // Раньше список умел только уводить по адресу; для вкладки это была бы полная
    // перезагрузка ради смены блока справа.
    const onSelect = vi.fn();
    const select = find(render('payments', onSelect), 'ui-select');
    select.props.onChange({ target: { value: '?tab=payments' } });
    expect(onSelect).toHaveBeenCalledWith('payments');
  });

  it('цель раздела считается одинаково для кнопки и для списка', () => {
    expect(settingsSectionTarget({ id: 'payments', title: 'Оплата' })).toBe('?tab=payments');
    expect(settingsSectionTarget({ id: 'users', title: 'Люди', href: '/users' })).toBe('/users');
    expect(isEmbeddedSection({ id: 'payments', title: 'Оплата' })).toBe(true);
    expect(isEmbeddedSection({ id: 'users', title: 'Люди', href: '/users' })).toBe(false);
  });
});
