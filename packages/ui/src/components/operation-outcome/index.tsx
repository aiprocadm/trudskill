import type { ReactElement, ReactNode } from 'react';

/**
 * Итог операции над несколькими объектами (CMP-011).
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

/**
 * Одна разметка итога на все операции пакетом: массовое действие в реестре и импорт файла
 * отвечают человеку одинаково. До выделения список отказов жил внутри `BulkActionBar`,
 * и второму месту пришлось бы его повторить — с риском «здесь поимённо, а здесь числом».
 */
export const OperationOutcome = ({
  outcome,
  successVerb = 'Готово',
  failuresTitle = 'Не удалось:',
  children
}: {
  outcome: BulkOutcome;
  /** Глагол сводки: «Готово», «Зачислено», «Закрыто». */
  successVerb?: string;
  failuresTitle?: string;
  /** Пояснение под сводкой: что делать с отказами. */
  children?: ReactNode;
}): ReactElement => (
  <div className="ui-outcome" role="status">
    <p className="ui-outcome__summary">
      {successVerb}: {outcome.succeeded} из {outcome.total}
    </p>
    {outcome.failures.length > 0 ? (
      <>
        <p className="ui-text-muted">{failuresTitle}</p>
        <ul className="ui-outcome__failures">
          {outcome.failures.map((failure) => (
            <li key={failure.label}>
              {failure.label} — {failure.reason}
            </li>
          ))}
        </ul>
      </>
    ) : null}
    {children}
  </div>
);
