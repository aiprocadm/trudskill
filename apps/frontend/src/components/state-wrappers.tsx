import { EmptyState, ErrorState, LoadingState } from '@trudskill/ui';

import type { PropsWithChildren, ReactNode } from 'react';

export const GlobalLoading = ({ message }: { message?: string }) => (
  <LoadingState message={message ?? 'Загрузка приложения...'} />
);

export const GlobalError = ({ message }: { message?: string }) => (
  <ErrorState message={message ?? 'Произошла непредвиденная ошибка'} />
);

export const SectionError = ({ message, onRetry }: { message?: string; onRetry?: () => void }) => (
  <div className="ui-stack">
    <ErrorState message={message ?? 'Не удалось загрузить секцию'} />
    {onRetry ? (
      <button type="button" className="ui-button" onClick={onRetry}>
        Повторить
      </button>
    ) : null}
  </div>
);

export const SectionEmpty = ({ message, hint }: { message?: string; hint?: string }) => {
  const resolvedMessage = message ?? 'Пока нет данных';
  if (hint !== undefined && hint !== '') {
    return <EmptyState message={resolvedMessage} hint={hint} />;
  }
  return <EmptyState message={resolvedMessage} />;
};

export const SectionCard = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <section className="ui-section-card">
    <h3 className="ui-section-title">{title}</h3>
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
