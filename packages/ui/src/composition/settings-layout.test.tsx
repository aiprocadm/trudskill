import { describe, expect, it } from 'vitest';

import { SettingsLayout, settingsSectionTarget } from './settings-layout.js';
import { propsOf } from '../testing/element.test-util.js';

const SECTIONS = [
  { id: 'payments', title: 'Оплата', hint: 'Платёжный провайдер центра' },
  { id: 'users', title: 'Люди и доступ', hint: 'Сотрудники центра', href: '/users' }
];

const Stub = () => null;

const render = (activeId?: string) =>
  SettingsLayout({
    sections: SECTIONS,
    link: Stub,
    children: 'СОДЕРЖИМОЕ',
    ...(activeId === undefined ? {} : { activeId })
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

describe('SettingsLayout — раскладка настроек (TPL-005)', () => {
  it('оглавление и содержимое — два разных места', () => {
    const el = render();
    expect(propsOf(el).className).toBe('ui-settings');
    expect(find(el, 'ui-settings__nav')?.type).toBe('nav');
    expect(find(el, 'ui-settings__body')?.props.children).toBe('СОДЕРЖИМОЕ');
  });

  it('встроенный раздел — якорь, свой маршрут — ссылка приложения', () => {
    const items = find(render(), 'ui-settings-toc').props.children;
    expect(items[0].props.children.type).toBe('a');
    expect(items[0].props.children.props.href).toBe('#payments');
    /* Маршрут открывается ссылкой приложения: обычная `a` перезагрузила бы страницу. */
    expect(items[1].props.children.type).toBe(Stub);
    expect(items[1].props.children.props.href).toBe('/users');
  });

  it('открытый раздел отмечен для чтения с экрана и для глаза', () => {
    const items = find(render('payments'), 'ui-settings-toc').props.children;
    expect(items[0].props.children.props['aria-current']).toBe('location');
    expect(items[1].props.children.props['aria-current']).toBeUndefined();
  });

  it('на телефоне те же разделы есть выпадающим списком', () => {
    const select = find(render('payments'), 'ui-select');
    expect(select.props.value).toBe('#payments');
    const options = select.props.children.flat();
    expect(options.map((option: any) => option.props.children)).toEqual([
      'Выберите раздел',
      'Оплата',
      'Люди и доступ'
    ]);
  });

  it('цель раздела считается одинаково для ссылки и для списка', () => {
    expect(settingsSectionTarget({ id: 'payments', title: 'Оплата' })).toBe('#payments');
    expect(settingsSectionTarget({ id: 'users', title: 'Люди', href: '/users' })).toBe('/users');
  });
});
