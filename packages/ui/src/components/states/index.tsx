import type { ReactElement } from 'react';

export interface EmptyStateAction {
  label: string;
  href?: string;
  onSelect?: () => void;
}

/**
 * CMP-014 + TXT-005: пустой экран объясняет, что это за раздел и что сделать первым.
 *
 * Формулировка «Нет данных» запрещена ТЗ: она сообщает пользователю ровно то, что он и так
 * видит. Дефолт заменён на «Пока пусто» — экраны, которые задают свой текст, не затронуты.
 */
export const EmptyState = ({
  message = 'Пока пусто',
  hint,
  action
}: {
  message?: string;
  hint?: string;
  action?: EmptyStateAction;
}): ReactElement => (
  <div className="ui-empty" role="status">
    {message}
    {hint ? <p className="ui-empty-hint">{hint}</p> : null}
    {action ? (
      <p className="ui-empty-action">
        {action.href ? (
          <a className="ui-button-primary" href={action.href}>
            {action.label}
          </a>
        ) : (
          <button type="button" className="ui-button-primary" onClick={action.onSelect}>
            {action.label}
          </button>
        )}
      </p>
    ) : null}
  </div>
);
/**
 * `TXT-004`: сверху — что произошло и что делать, техническая часть — под спойлером.
 *
 * Администратору учебного центра код ошибки не говорит ничего, а поддержке без него не найти
 * причину. Спойлер разводит эти два интереса и не заставляет одного читать нужное другому.
 */
export const ErrorState = ({
  message = 'Не удалось загрузить данные',
  details
}: {
  message?: string;
  /** Код, ответ сервера, номер запроса — одной строкой. Без него спойлера нет. */
  details?: string;
}): ReactElement => (
  <div className="ui-error" role="alert">
    {message}
    {details ? (
      <details className="ui-text-muted">
        <summary>Подробности</summary>
        <span>{details}</span>
      </details>
    ) : null}
  </div>
);
export const LoadingState = ({ message = 'Загрузка…' }: { message?: string }): ReactElement => (
  <div className="ui-loading" role="status" aria-live="polite" aria-busy="true">
    {message}
  </div>
);
