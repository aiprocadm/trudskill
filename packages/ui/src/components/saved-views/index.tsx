'use client';

import { useState } from 'react';

import type { ReactElement } from 'react';

/**
 * `CMP-012` · сохранённые представления списка.
 *
 * Администратор возвращается к одним и тем же срезам: «кто ещё учится», «архив». Каждый
 * раз выставлять фильтры заново — работа, которую человек делает вместо своей работы.
 *
 * **Умолчание вместо настройки.** Пустой список «сохранённых» бесполезен: чтобы им
 * пользоваться, нужно сначала догадаться, что он есть, и что-то в него положить. Поэтому
 * реестр приходит с 2–3 готовыми представлениями, а свои добавляются сверху.
 */

export interface SavedView {
  id: string;
  label: string;
  /** Значения фильтров экрана: `{ status: 'active' }`. Пустая строка — «не выбрано». */
  query: Record<string, string>;
  /** Предустановленное представление удалить нельзя — оно часть экрана, а не заметка. */
  preset?: boolean;
}

export interface SavedViewsProps {
  views: SavedView[];
  activeId?: string;
  onApply: (id: string) => void;
  onSave: (label: string) => void;
  onDelete: (id: string) => void;
}

export const SavedViews = ({
  views,
  activeId,
  onApply,
  onSave,
  onDelete
}: SavedViewsProps): ReactElement => {
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setLabel('');
    setNaming(false);
  };

  return (
    <div className="ui-saved-views">
      <span className="ui-saved-views__label">Быстрые отборы:</span>

      {views.map((view) => (
        <span key={view.id} className="ui-saved-views__item">
          <button
            type="button"
            className={`ui-chip ${view.id === activeId ? 'ui-chip--active' : ''}`}
            aria-pressed={view.id === activeId}
            onClick={() => onApply(view.id)}
          >
            {view.label}
          </button>
          {/*
            Удалять можно только свои отборы. Предустановленные — часть экрана: убери их,
            и человек останется с пустым списком, ради которого всё и затевалось.
          */}
          {view.preset ? null : (
            <button
              type="button"
              className="ui-saved-views__remove"
              aria-label={`Удалить отбор «${view.label}»`}
              onClick={() => onDelete(view.id)}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {naming ? (
        <span className="ui-saved-views__item">
          <input
            className="ui-input ui-saved-views__input"
            value={label}
            placeholder="Название отбора"
            aria-label="Название отбора"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') setNaming(false);
            }}
          />
          <button type="button" className="ui-chip" onClick={submit} disabled={!label.trim()}>
            Сохранить отбор
          </button>
        </span>
      ) : (
        <button type="button" className="ui-chip" onClick={() => setNaming(true)}>
          Сохранить текущий отбор
        </button>
      )}
    </div>
  );
};
