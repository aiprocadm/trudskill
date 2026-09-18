'use client';

import type { PropsWithChildren, ReactElement } from 'react';

export interface PageTab {
  /** Попадает в адрес страницы (`?tab=`), поэтому пишется латиницей и без пробелов. */
  id: string;
  label: string;
  /** Число рядом с подписью: «Задачи выпуска 3». Ноль не показывается. */
  count?: number;
}

const tabButtonId = (id: string): string => `ui-tab-${id}`;
const tabPanelId = (id: string): string => `ui-tabpanel-${id}`;

/**
 * `TPL-002` · вкладки страницы — **один уровень** (ТЗ «Стабилизация, UX и развитие», 5.7 / Э7).
 *
 * Зачем. «Простыня» — страница, где в одну ленту свалено 4–6 несвязанных блоков: человек
 * прокручивает её целиком, чтобы понять, что на ней вообще есть, и теряет место, к которому
 * хотел вернуться. Вкладки показывают состав страницы одной строкой и открывают ровно один
 * блок за раз.
 *
 * **Вложенные вкладки запрещены** (§7.2): второй уровень превращает навигацию в лабиринт —
 * человек перестаёт понимать, где он находится и что откроется по кнопке «назад».
 *
 * **Открытая вкладка живёт в адресе** (`?tab=`) — иначе ссылку на нужный блок нельзя передать
 * коллеге, а кнопка «назад» уводит со страницы целиком вместо возврата к прошлой вкладке.
 * Сам адрес пишет экран (`useTabParam`): держать маршрутизатор приложения в пакете
 * компонентов значило бы привязать пакет к приложению.
 *
 * На телефоне полоса вкладок прокручивается вбок — переносить их по строкам значит съесть
 * половину экрана; тач-зона каждой вкладки 44px (решение владельца №C).
 */
export const PageTabs = ({
  tabs,
  activeId,
  onSelect,
  label = 'Разделы страницы'
}: {
  tabs: PageTab[];
  activeId: string;
  onSelect: (id: string) => void;
  label?: string;
}): ReactElement => (
  <div className="ui-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab) => {
      const active = tab.id === activeId;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tabButtonId(tab.id)}
          aria-selected={active}
          aria-controls={tabPanelId(tab.id)}
          className={`ui-tab${active ? ' ui-tab--active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {tab.count ? <span className="ui-badge-count">{tab.count}</span> : null}
        </button>
      );
    })}
  </div>
);

/**
 * Содержимое одной вкладки. Скрытая вкладка **не рисуется вовсе**, а не прячется стилем:
 * иначе поиск по странице (Ctrl+F) находил бы текст, которого человек не видит, а тяжёлые
 * блоки грузили бы данные впустую.
 */
export const TabPanel = ({
  id,
  activeId,
  children
}: PropsWithChildren<{ id: string; activeId: string }>): ReactElement | null =>
  id === activeId ? (
    <div role="tabpanel" id={tabPanelId(id)} aria-labelledby={tabButtonId(id)} className="ui-stack">
      {children}
    </div>
  ) : null;
