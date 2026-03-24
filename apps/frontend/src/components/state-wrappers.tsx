import { EmptyState, ErrorState, LoadingState } from '@cdoprof/ui';
import type { PropsWithChildren, ReactNode } from 'react';

export const GlobalLoading = ({ message }: { message?: string }) => <LoadingState message={message ?? 'Загрузка приложения...'} />;

export const GlobalError = ({ message }: { message?: string }) => <ErrorState message={message ?? 'Произошла непредвиденная ошибка'} />;

export const SectionError = ({ message, onRetry }: { message?: string; onRetry?: () => void }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    <ErrorState message={message ?? 'Не удалось загрузить секцию'} />
    {onRetry ? <button onClick={onRetry}>Повторить</button> : null}
  </div>
);

export const SectionEmpty = ({ message }: { message?: string }) => <EmptyState message={message ?? 'Пока нет данных'} />;

export const SectionCard = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <section style={{ border: '1px solid #d4d4d8', borderRadius: 8, padding: 16, display: 'grid', gap: 12 }}>
    <h3 style={{ margin: 0 }}>{title}</h3>
    {children}
  </section>
);

export const PageHeader = ({ title, actions }: { title: string; actions?: ReactNode }) => (
  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <h1 style={{ margin: 0 }}>{title}</h1>
    <div>{actions}</div>
  </header>
);

export const PageContainer = ({ children }: PropsWithChildren) => (
  <main style={{ display: 'grid', gap: 16, padding: 20 }}>{children}</main>
);
