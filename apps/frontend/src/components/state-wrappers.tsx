import { EmptyState, ErrorState, LoadingState } from '@cdoprof/ui';

import type { PropsWithChildren, ReactNode } from 'react';

export const GlobalLoading = ({ message }: { message?: string }) => (
  <LoadingState message={message ?? 'Загрузка приложения...'} />
);

export const GlobalError = ({ message }: { message?: string }) => (
  <ErrorState message={message ?? 'Произошла непредвиденная ошибка'} />
);

export const SectionError = ({ message, onRetry }: { message?: string; onRetry?: () => void }) => (
  <div className="ui-stack" style={{ gap: 8 }}>
    <ErrorState message={message ?? 'Не удалось загрузить секцию'} />
    {onRetry ? <button onClick={onRetry}>Повторить</button> : null}
  </div>
);

export const SectionEmpty = ({ message }: { message?: string }) => (
  <EmptyState message={message ?? 'Пока нет данных'} />
);

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
  <header
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}
  >
    <div className="ui-stack" style={{ gap: 4 }}>
      <h1 style={{ margin: 0 }}>{title}</h1>
      {subtitle ? <p style={{ margin: 0, color: 'var(--ui-text-muted)' }}>{subtitle}</p> : null}
    </div>
    {actions ? <div>{actions}</div> : null}
  </header>
);

export const PageContainer = ({ children }: PropsWithChildren) => (
  <main className="ui-page">{children}</main>
);
