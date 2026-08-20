import { EmptyState, ErrorState, LoadingState } from '@trudskill/ui';

import { describeError } from '../lib/errors/error-text';

import type { PropsWithChildren, ReactNode } from 'react';

export const GlobalLoading = ({ message }: { message?: string }) => (
  <LoadingState message={message ?? 'Загрузка приложения...'} />
);

export const GlobalError = ({ message }: { message?: string }) => (
  <ErrorState message={message ?? 'Произошла непредвиденная ошибка'} />
);

/**
 * `TXT-004`: можно передать саму пойманную ошибку (`error`) вместо готовой строки — тогда
 * человек увидит объяснение «что произошло и что делать», а код, ответ сервера и номер
 * запроса уедут под спойлер «Подробности». Приём строки сохранён: не все места ловят объект.
 */
export const SectionError = ({
  message,
  error,
  onRetry
}: {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
}) => {
  const view = error === undefined ? undefined : describeError(error);
  return (
    <div className="ui-stack">
      <ErrorState
        message={view?.message ?? message ?? 'Не удалось загрузить секцию'}
        {...(view?.details ? { details: view.details } : {})}
      />
      {onRetry ? (
        <button type="button" className="ui-button" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
};

export const SectionEmpty = ({ message, hint }: { message?: string; hint?: string }) => {
  const resolvedMessage = message ?? 'Пока нет данных';
  if (hint !== undefined && hint !== '') {
    return <EmptyState message={resolvedMessage} hint={hint} />;
  }
  return <EmptyState message={resolvedMessage} />;
};

export const SectionCard = ({
  title,
  subtitle,
  actions,
  children
}: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode }>) => (
  <section className="ui-section-card">
    <div className="ui-section-head">
      <div>
        <h3 className="ui-section-title">{title}</h3>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-inline">{actions}</div> : null}
    </div>
    {children}
  </section>
);

export const PageHeader = ({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => (
  <header className="ui-page-header">
    <div>
      <h1 className="ui-page-title">{title}</h1>
      {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
    </div>
    {actions ? <div className="ui-inline">{actions}</div> : null}
  </header>
);

export const PageContainer = ({ children }: PropsWithChildren) => (
  <main className="ui-page">{children}</main>
);
