import { describe, expect, it, vi } from 'vitest';

import { PageTabs, TabPanel } from './index.js';
import { childrenOf, propsOf } from '../../testing/element.test-util.js';

const TABS = [
  { id: 'content', label: 'Содержание' },
  { id: 'params', label: 'Параметры' },
  { id: 'docs', label: 'Документы', count: 3 }
];

describe('PageTabs — один уровень вкладок (ТЗ 5.7)', () => {
  it('полоса вкладок объявлена как вкладки, а не как набор кнопок', () => {
    const el = PageTabs({ tabs: TABS, activeId: 'content', onSelect: () => {} });
    expect(propsOf(el).role).toBe('tablist');
    expect(propsOf(el).className).toBe('ui-tabs');
    expect(propsOf(el)['aria-label']).toBe('Разделы страницы');
  });

  it('открытая вкладка помечена и для глаза, и для читалки экрана', () => {
    const el = PageTabs({ tabs: TABS, activeId: 'params', onSelect: () => {} });
    const buttons = childrenOf(el) as any[];
    const open = buttons.find((b) => b.props.id === 'ui-tab-params');
    const closed = buttons.find((b) => b.props.id === 'ui-tab-content');

    expect(open.props['aria-selected']).toBe(true);
    // Цвет один смысла не несёт (WCAG 1.4.1) — у открытой вкладки свой класс с подчёркиванием.
    expect(open.props.className).toContain('ui-tab--active');
    expect(closed.props['aria-selected']).toBe(false);
    expect(closed.props.className).not.toContain('ui-tab--active');
  });

  it('вкладка связана со своим содержимым в обе стороны', () => {
    const el = PageTabs({ tabs: TABS, activeId: 'content', onSelect: () => {} });
    const button = (childrenOf(el) as any[])[0];
    expect(button.props['aria-controls']).toBe('ui-tabpanel-content');

    const panel = TabPanel({ id: 'content', activeId: 'content', children: 'ТЕЛО' });
    expect(propsOf(panel!).id).toBe('ui-tabpanel-content');
    expect(propsOf(panel!)['aria-labelledby']).toBe('ui-tab-content');
    expect(propsOf(panel!).role).toBe('tabpanel');
  });

  it('выбор вкладки уходит наружу — адрес пишет экран, а не компонент', () => {
    const onSelect = vi.fn();
    const el = PageTabs({ tabs: TABS, activeId: 'content', onSelect });
    (childrenOf(el) as any[])[1].props.onClick();
    expect(onSelect).toHaveBeenCalledWith('params');
  });

  it('число рядом с подписью показывается, а ноль — нет', () => {
    const el = PageTabs({
      tabs: [...TABS, { id: 'tasks', label: 'Задачи', count: 0 }],
      activeId: 'content',
      onSelect: () => {}
    });
    const buttons = childrenOf(el) as any[];
    const withCount = buttons.find((b) => b.props.id === 'ui-tab-docs');
    const zero = buttons.find((b) => b.props.id === 'ui-tab-tasks');
    // Пустой значок «0» человек читает как «что-то есть» и идёт проверять.
    expect(JSON.stringify(withCount.props.children)).toContain('ui-badge-count');
    expect(JSON.stringify(zero.props.children)).not.toContain('ui-badge-count');
  });

  it('закрытая вкладка НЕ рисуется вовсе, а не прячется стилем', () => {
    // Спрятанное стилем находится поиском по странице и грузит данные впустую.
    expect(TabPanel({ id: 'params', activeId: 'content', children: 'ТЕЛО' })).toBeNull();
  });
});
