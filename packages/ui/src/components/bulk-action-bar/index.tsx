import { OperationOutcome } from '../operation-outcome/index.js';

import type { BulkOutcome } from '../operation-outcome/index.js';
import type { ReactElement } from 'react';

export interface BulkAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

// Тип итога переехал в `operation-outcome` (им пользуется и экран импорта).
// Реэкспорт оставлен, чтобы не переписывать импорты в приложении.
export type { BulkOutcome } from '../operation-outcome/index.js';

export const BulkActionBar = ({
  selectedCount,
  actions,
  onClear,
  isRunning = false,
  outcome
}: {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  isRunning?: boolean;
  outcome?: BulkOutcome;
}): ReactElement | null => {
  // Ничего не выделено и нечего показать по итогу — панели нет вовсе.
  if (selectedCount === 0 && !outcome) return null;

  /*
   * Э5 + Э4: опасное действие печатается ПОСЛЕДНИМ, за полезными. Порядок считает компонент,
   * а не каждый вызывающий: «Архивировать» не должно стоять там, куда человек целится, промахнувшись.
   */
  const ordered = [...actions.filter((a) => !a.danger), ...actions.filter((a) => a.danger)];

  return (
    <>
      <div className="ui-bulk-bar" role="region" aria-label="Массовые действия">
        {selectedCount > 0 ? (
          <div className="ui-bulk-bar__row">
            <span className="ui-bulk-bar__count" aria-live="polite">
              Выделено: {selectedCount}
            </span>
            {ordered.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.danger ? 'ui-button-danger' : 'ui-button-secondary'}
                disabled={isRunning || action.disabled === true}
                onClick={action.onSelect}
              >
                {action.label}
              </button>
            ))}
            <button type="button" className="ui-button-link" onClick={onClear} disabled={isRunning}>
              Снять выделение
            </button>
            {isRunning ? <span className="ui-text-muted">Выполняется…</span> : null}
          </div>
        ) : null}

        {outcome ? <OperationOutcome outcome={outcome} /> : null}
      </div>
      {/* Панель висит над страницей — место под неё нужно оставить, иначе она накроет список. */}
      <div className="ui-bulk-bar-spacer" aria-hidden={true} />
    </>
  );
};
