import type { ReactElement } from 'react';

export const EmptyState = ({
  message = 'Нет данных',
  hint
}: {
  message?: string;
  hint?: string;
}): ReactElement => (
  <div className="ui-empty" role="status">
    {message}
    {hint ? <p className="ui-empty-hint">{hint}</p> : null}
  </div>
);
export const ErrorState = ({
  message = 'Не удалось загрузить данные'
}: {
  message?: string;
}): ReactElement => (
  <div className="ui-error" role="alert">
    {message}
  </div>
);
export const LoadingState = ({ message = 'Загрузка…' }: { message?: string }): ReactElement => (
  <div className="ui-loading" role="status" aria-live="polite" aria-busy="true">
    {message}
  </div>
);
