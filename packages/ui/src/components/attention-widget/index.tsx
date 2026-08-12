import { isOverdue, sortByUrgency } from './attention.js';
import { EmptyState } from '../states/index.js';

import type { AttentionItem } from './attention.js';
import type { ReactElement } from 'react';

export type { AttentionItem, AttentionSeverity } from './attention.js';

const SEVERITY_LABEL = {
  high: 'Критично',
  medium: 'Важно',
  low: 'Может подождать'
} as const;

/**
 * Блок «Разобрать» (CMP-013) — очередь того, что требует внимания.
 *
 * Собирает разнородные источники (блокеры, просроченные задачи) в ОДИН список по убыванию
 * срочности. Пользователю нужна очередь, а не оглавление: пока блокеры и задачи лежат
 * отдельными таблицами, приоритет между ними человек расставляет сам.
 */
export const AttentionWidget = ({
  items,
  maxVisible = 7,
  now = Date.now(),
  emptyState
}: {
  items: AttentionItem[];
  maxVisible?: number;
  /** Время передаётся снаружи — так сортировку можно проверить тестом. */
  now?: number;
  emptyState: { message: string; hint?: string };
}): ReactElement => {
  const sorted = sortByUrgency(items);
  const visible = sorted.slice(0, maxVisible);
  const hidden = sorted.length - visible.length;

  if (sorted.length === 0) {
    return (
      <EmptyState
        message={emptyState.message}
        {...(emptyState.hint ? { hint: emptyState.hint } : {})}
      />
    );
  }

  return (
    <div className="ui-attention">
      <ul className="ui-attention__list">
        {visible.map((item) => (
          <li key={item.id} className={`ui-attention__item ui-attention__item--${item.severity}`}>
            <a className="ui-attention__link" href={item.href}>
              <span className="ui-attention__title">{item.title}</span>
              <span className="ui-attention__meta">
                {SEVERITY_LABEL[item.severity]}
                {isOverdue(item, now) ? ' · просрочено' : ''}
                {item.kind ? ` · ${item.kind}` : ''}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p className="ui-attention__rest">Ещё {hidden} — ниже на странице</p> : null}
    </div>
  );
};
