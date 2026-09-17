import { describe, expect, it } from 'vitest';

import { type RowAction, splitRowActions } from './row-actions.js';

const noop = () => undefined;
const a = (label: string, extra: Partial<RowAction> = {}): RowAction => ({
  label,
  onSelect: noop,
  ...extra
});

/** Один набор действий в строке (ТЗ 5.1 / Э1). */
describe('splitRowActions', () => {
  it('основное действие — в строке, остальное — в меню, опасные — отдельно', () => {
    const layout = splitRowActions([
      a('Включить работу центра', { danger: true }),
      a('Сменить тариф'),
      a('Открыть', { primary: true }),
      a('Войти от имени')
    ]);
    expect(layout.inline?.label).toBe('Открыть');
    expect(layout.menu.map((x) => x.label)).toEqual(['Сменить тариф', 'Войти от имени']);
    expect(layout.danger.map((x) => x.label)).toEqual(['Включить работу центра']);
  });

  it('без основного действия в строке пусто — всё в меню', () => {
    const layout = splitRowActions([a('Сменить тариф'), a('Войти от имени')]);
    expect(layout.inline).toBeNull();
    expect(layout.menu).toHaveLength(2);
  });

  it('единственное неопасное действие показывается сразу: меню из одного пункта — лишний клик', () => {
    const layout = splitRowActions([a('Открыть группу')]);
    expect(layout.inline?.label).toBe('Открыть группу');
    expect(layout.menu).toEqual([]);
  });

  it('единственное ОПАСНОЕ действие в строку не выходит — только через меню', () => {
    const layout = splitRowActions([a('Архивировать', { danger: true })]);
    expect(layout.inline).toBeNull();
    expect(layout.danger.map((x) => x.label)).toEqual(['Архивировать']);
  });

  it('опасное действие не может быть основным — оно уходит в меню, строка остаётся пустой', () => {
    const layout = splitRowActions([a('Удалить', { primary: true, danger: true }), a('Открыть')]);
    expect(layout.inline, 'опасное «основное» игнорируется').toBeNull();
    expect(layout.menu.map((x) => x.label)).toEqual(['Открыть']);
    expect(layout.danger.map((x) => x.label)).toEqual(['Удалить']);
  });

  it('пустой список — ничего', () => {
    expect(splitRowActions([])).toEqual({ inline: null, menu: [], danger: [] });
  });
});
