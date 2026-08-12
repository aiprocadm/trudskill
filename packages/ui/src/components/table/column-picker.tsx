'use client';

import { useState } from 'react';

import { toggleColumn } from './column-config.js';

import type { ReactElement } from 'react';

export interface ColumnPickerItem {
  key: string;
  title: string;
}

/**
 * Кнопка «Колонки» для панели фильтров (CMP-002).
 *
 * Живёт рядом с фильтрами, а не внутри таблицы: по ТЗ это часть панели управления списком.
 * Первая колонка в списке всегда отмечена и заблокирована — по ней узнают строку.
 */
export const ColumnPicker = ({
  columns,
  visibleKeys,
  onChange,
  label = 'Колонки'
}: {
  columns: ColumnPickerItem[];
  visibleKeys: string[];
  onChange: (next: string[]) => void;
  label?: string;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const allKeys = columns.map((c) => c.key);
  const hiddenCount = allKeys.length - visibleKeys.length;

  return (
    <div className="ui-column-picker">
      <button
        type="button"
        className="ui-button-secondary"
        aria-expanded={open}
        aria-controls="ui-column-picker-list"
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
        {hiddenCount > 0 ? <span className="ui-badge-count">{hiddenCount}</span> : null}
      </button>
      {open ? (
        <div
          id="ui-column-picker-list"
          className="ui-column-picker__list"
          role="group"
          aria-label={label}
        >
          {columns.map((column, index) => (
            <label key={column.key} className="ui-column-picker__item">
              <input
                type="checkbox"
                checked={visibleKeys.includes(column.key)}
                disabled={index === 0}
                onChange={() => onChange(toggleColumn(allKeys, visibleKeys, column.key))}
              />
              {column.title}
            </label>
          ))}
          <button type="button" className="ui-button-link" onClick={() => onChange(allKeys)}>
            Показать все
          </button>
        </div>
      ) : null}
    </div>
  );
};
