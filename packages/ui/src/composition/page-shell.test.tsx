import { describe, expect, it } from 'vitest';

import { PageHeader, SectionCard } from './page-shell.js';

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

    const primaries = flatten(el).filter((node) =>
      String(propsOf(node)?.className ?? '').includes('ui-button--primary')
    );
    expect(primaries).toHaveLength(1);
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

describe('CMP-020 · SectionCard', () => {
  it('секция с заголовком и слотом действий', () => {
    const el = asElement(SectionCard({ title: 'Список', actions: 'ACT', children: 'X' }));
    expect(propsOf(el).className).toBe('ui-section-card');
    expect(JSON.stringify(propsOf(el).children)).toContain('ACT');
  });
});
