import type { ReactElement } from 'react';

export interface BulkAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Итог массовой операции (CMP-011).
 *
 * Частичный успех — обязательное состояние, а не опциональное: в системе действует принцип
 * «валидные строки принимаются, отказы показываются поимённо с причиной». Сводка вида
 * «12 из 15» без имён оставляет человека без ответа на вопрос «а что с остальными тремя».
 */
export interface BulkOutcome {
  total: number;
  succeeded: number;
  failures: Array<{ label: string; reason: string }>;
}

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

  return (
    <div className="ui-bulk-bar" role="region" aria-label="Массовые действия">
      {selectedCount > 0 ? (
        <div className="ui-bulk-bar__row">
          <span className="ui-bulk-bar__count" aria-live="polite">
            Выделено: {selectedCount}
          </span>
          {actions.map((action) => (
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

      {outcome ? (
        <div className="ui-bulk-bar__outcome" role="status">
          <p>
            Готово: {outcome.succeeded} из {outcome.total}
          </p>
          {outcome.failures.length > 0 ? (
            <>
              <p className="ui-text-muted">Не удалось:</p>
              <ul className="ui-bulk-bar__failures">
                {outcome.failures.map((failure) => (
                  <li key={failure.label}>
                    {failure.label} — {failure.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
