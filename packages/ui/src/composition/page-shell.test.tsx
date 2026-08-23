import { describe, expect, it } from 'vitest';

import { PageHeader, SectionCard } from './page-shell.js';
import { Button } from '../components/button/index.js';

import type { ReactElement } from 'react';

/**
 * `CMP-015`: шапка страницы с бюджетом первичного действия на уровне типа.
 *
 * `primaryAction` — не массив: второй primary некуда передать, бюджет `UI-007` перестаёт
 * быть договорённостью. Вторичные действия уходят в меню «Ещё» и рисуются нейтральными.
 */

const asElement = (value: unknown): ReactElement => value as ReactElement;
const propsOf = (el: unknown): Record<string, unknown> =>
  (el as { props: Record<string, unknown> }).props;

const flatten = (node: unknown): unknown[] => {
  if (node === null || node === undefined || node === false) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  const el = node as { props?: { children?: unknown } };
  return [node, ...(el.props ? flatten(el.props.children) : [])];
};

describe('CMP-015 · PageHeader', () => {
  it('первичное действие — ровно одна коралловая кнопка с подписью результата', () => {
    const el = PageHeader({
      title: 'Слушатели',
      primaryAction: { label: 'Добавить слушателя', onSelect: () => undefined }
    });

    /*
     * Кнопка берётся из пакета (`Button`), а не пишется в шапке заново: там уже собраны
     * класс варианта, отключение во время работы и `aria-busy`. Тесты пакета вызывают
     * компоненты функциями и вложенный элемент не раскрывают — поэтому проверяется тип
     * элемента и его свойства, а не строка класса.
     */
    const primaries = flatten(el).filter((node) => (node as { type?: unknown }).type === Button);
    expect(primaries).toHaveLength(1);
    expect(propsOf(primaries[0]).variant).toBe('primary');
    expect(propsOf(primaries[0]).children).toBe('Добавить слушателя');
  });

  it('вторичные действия живут в меню «Ещё», а не рядом с первичной кнопкой', () => {
    const el = PageHeader({
      title: 'Слушатели',
      primaryAction: { label: 'Добавить', onSelect: () => undefined },
      secondaryActions: [
        { label: 'Импорт из файла', onSelect: () => undefined },
        { label: 'Выгрузить список', onSelect: () => undefined }
      ]
    });

    const menu = flatten(el).find((node) => (node as { type?: unknown }).type === 'details');
    expect(menu, 'меню «Ещё» не найдено').toBeTruthy();
    const items = flatten(menu).filter((node) =>
      String(propsOf(node)?.className ?? '').includes('ui-header-menu__item')
    );
    expect(items).toHaveLength(2);
    // Пункты меню — нейтральные кнопки: не соревнуются с первичной (UI-003).
    for (const item of items) {
      expect(String(propsOf(item).className)).not.toContain('primary');
    }
  });

  it('заголовок и подзаголовок на месте', () => {
    const el = PageHeader({ title: 'Слушатели', subtitle: 'Реестр' });
    const texts = flatten(el).map((node) => propsOf(node)?.children);
    expect(texts).toContain('Слушатели');
    expect(texts).toContain('Реестр');
  });
});

describe('CMP-015 · формы действия шапки', () => {
  it('переход остаётся ссылкой: тег a с адресом, а не кнопка с обработчиком', () => {
    const el = PageHeader({
      title: 'Курсы',
      primaryAction: { label: 'Создать курс', href: '/courses/new' }
    });

    const link = flatten(el).find((node) => (node as { type?: unknown }).type === 'a');
    expect(link, 'ссылка не найдена — переход нарисован кнопкой').toBeTruthy();
    expect(propsOf(link).href).toBe('/courses/new');
    // Одета так же, как кнопка: человек не должен видеть разницы.
    expect(String(propsOf(link).className)).toContain('ui-button--primary');
  });

  it('занятость показывает крутилка, а подпись не меняется (TXT-003)', () => {
    const idle = PageHeader({
      title: 'Нужна переаттестация',
      primaryAction: { label: 'Проверить сроки', onSelect: () => undefined }
    });
    const busy = PageHeader({
      title: 'Нужна переаттестация',
      primaryAction: { label: 'Проверить сроки', onSelect: () => undefined, busy: true }
    });

    const labelOf = (el: unknown) =>
      flatten(el)
        .map((node) => propsOf(node)?.children)
        .find((child) => typeof child === 'string' && child.includes('Проверить'));

    expect(labelOf(busy)).toBe(labelOf(idle));
    const busyButton = flatten(busy).find((node) => (node as { type?: unknown }).type === Button);
    expect(propsOf(busyButton!).loading, 'занятость ничем не показана').toBe(true);
    const idleButton = flatten(idle).find((node) => (node as { type?: unknown }).type === Button);
    expect(propsOf(idleButton!).loading).toBeUndefined();
  });

  it('недоступное действие приходит отключённым, а не исчезает', () => {
    const el = PageHeader({
      title: 'Курс',
      primaryAction: { label: 'Опубликовать курс', onSelect: () => undefined, disabled: true }
    });
    const button = flatten(el).find((node) => (node as { type?: unknown }).type === Button);
    expect(propsOf(button!).disabled).toBe(true);
  });
});

describe('CMP-020 · SectionCard', () => {
  it('секция с заголовком и слотом действий', () => {
    const el = asElement(SectionCard({ title: 'Список', actions: 'ACT', children: 'X' }));
    expect(propsOf(el).className).toBe('ui-section-card');
    expect(JSON.stringify(propsOf(el).children)).toContain('ACT');
  });
});
