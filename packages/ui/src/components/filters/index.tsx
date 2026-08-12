'use client';

import { useState } from 'react';

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

/**
 * Нужен ли сигнал «список отфильтрован скрытыми фильтрами» (CMP-003).
 *
 * Бюджет ТЗ — не больше трёх видимых фильтров, остальные уезжают под «Ещё фильтры».
 * Главная опасность такого свёртывания: список короткий, а человек не понимает почему.
 * В развёрнутом виде сигнал не нужен — фильтры видны сами.
 */
export const hasHiddenActiveFilters = (activeCount: number, expanded: boolean): boolean =>
  activeCount > 0 && !expanded;

export const FilterBar = ({
  children,
  label = 'Фильтры',
  primary,
  secondary,
  activeCount = 0,
  onReset,
  extra
}: PropsWithChildren<{
  label?: string;
  /** До трёх контролов, видны всегда. Не задано — используется children (прежнее поведение). */
  primary?: ReactNode;
  /** Раскрываются по кнопке «Ещё фильтры». */
  secondary?: ReactNode;
  /** Сколько скрытых фильтров сейчас заданы — показывается на кнопке. */
  activeCount?: number;
  onReset?: () => void;
  /** Место для кнопок управления списком: выбор колонок и т.п. */
  extra?: ReactNode;
}>): ReactElement => {
  const [expanded, setExpanded] = useState(false);
  const showBadge = hasHiddenActiveFilters(activeCount, expanded);

  return (
    <div className="ui-filter-bar" role="group" aria-label={label}>
      <div className="ui-filter-bar__row">
        {primary ?? children}
        {secondary ? (
          <button
            type="button"
            className="ui-button-secondary"
            aria-expanded={expanded}
            aria-controls="ui-filter-bar-secondary"
            onClick={() => setExpanded((prev) => !prev)}
          >
            Ещё фильтры
            {showBadge ? <span className="ui-badge-count">{activeCount}</span> : null}
          </button>
        ) : null}
        {extra}
        {onReset && activeCount > 0 ? (
          <button type="button" className="ui-button-link" onClick={onReset}>
            Сбросить
          </button>
        ) : null}
      </div>
      {secondary && expanded ? (
        <div
          id="ui-filter-bar-secondary"
          className="ui-filter-bar__row ui-filter-bar__row--secondary"
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
};
