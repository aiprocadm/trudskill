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

  it('опасное вторичное действие — красным и в НИЗУ меню (Э4, ТЗ 5.4)', () => {
    /*
     * Порядок считает компонент, а не вызывающий: экран передал опасное действие первым,
     * а в меню оно обязано оказаться последним — иначе «Закрыть группу» стоит там, куда
     * человек целится, промахнувшись на пункт.
     */
    const el = PageHeader({
      title: 'Группа ОТ-14',
      primaryAction: { label: 'Зачислить слушателя', onSelect: () => undefined },
      secondaryActions: [
        { label: 'Закрыть группу', danger: true, onSelect: () => undefined },
        { label: 'Сгенерировать приказ', onSelect: () => undefined }
      ]
    });

    const menu = flatten(el).find((node) => (node as { type?: unknown }).type === 'details');
    const items = flatten(menu).filter((node) =>
      String(propsOf(node)?.className ?? '').includes('ui-header-menu__item')
    );
    expect(items.map((i) => propsOf(i).children)).toEqual([
      'Сгенерировать приказ',
      'Закрыть группу'
    ]);
    expect(String(propsOf(items[1]).className)).toContain('ui-header-menu__item--danger');
    expect(String(propsOf(items[0]).className)).not.toContain('danger');
  });

  it('единственное опасное действие — красная кнопка рядом, а не коралловая', () => {
    const el = PageHeader({
      title: 'Лицензия № 77-123',
      secondaryActions: [{ label: 'Отозвать лицензию', danger: true, onSelect: () => undefined }]
    });

    const danger = flatten(el).filter((node) => propsOf(node)?.variant === 'danger');
    expect(danger).toHaveLength(1);
    expect(propsOf(danger[0]).children).toBe('Отозвать лицензию');
    expect(
      flatten(el).filter((node) => propsOf(node)?.variant === 'primary'),
      'опасное действие не носит конструктивный акцент'
    ).toHaveLength(0);
  });

  it('единственное второстепенное действие остаётся кнопкой, а не прячется в меню', () => {
    // «Ещё» из одного пункта — два нажатия вместо одного и спрятанная от глаз возможность.
    // Меню начинается с двух пунктов; одиночное действие рисуется нейтральной кнопкой.
    const el = PageHeader({
      title: 'Книга выдачи',
      secondaryActions: [{ label: 'Скачать таблицей', onSelect: () => undefined }]
    });

    const menu = flatten(el).find((node) => (node as { type?: unknown }).type === 'details');
    expect(menu, 'меню «Ещё» не должно появляться ради одного пункта').toBeFalsy();
    const buttons = flatten(el).filter((node) => propsOf(node)?.variant === 'secondary');
    expect(buttons).toHaveLength(1);
    expect(propsOf(buttons[0]).children).toBe('Скачать таблицей');
  });

  it('служебное содержимое живёт в своём слоте и не считается действием (CMP-020, волна 2)', () => {
    // Значок статуса, переключатель роли, листание месяцев — не действия страницы. Пока
    // им не было своего слота, они держали переходный `actions` и мешали его закрыть.
    const chip = { type: 'span', props: { children: 'Опубликован' } } as never;
    const el = PageHeader({
      title: 'Тест курса',
      toolsSlot: chip,
      primaryAction: { label: 'Опубликовать', onSelect: () => undefined }
    });

    const texts = flatten(el).map((node) => propsOf(node)?.children);
    expect(texts).toContain('Опубликован');
    const primaries = flatten(el).filter((node) => propsOf(node)?.variant === 'primary');
    expect(primaries, 'служебный слот не должен считаться первичным действием').toHaveLength(1);
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
