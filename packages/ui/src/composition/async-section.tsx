import { EmptyState, ErrorState, LoadingState } from '../components/states/index';

import type { ReactElement, ReactNode } from 'react';

export interface AsyncSectionProps {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingMessage?: string;
  emptyMessage?: string;
  emptyHint?: string;
  children: ReactNode;
}

// Единая цепочка загрузка → ошибка(+повтор) → пусто → контент.
// Заменяет копипаст isLoading?/error?/empty? в экранах (см. §5.16x Фаза 3).
export const AsyncSection = ({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  loadingMessage,
  emptyMessage,
  emptyHint,
  children
}: AsyncSectionProps): ReactElement => {
  if (isLoading) {
    return <LoadingState {...(loadingMessage ? { message: loadingMessage } : {})} />;
  }
  if (error) {
    const message = error instanceof Error ? error.message : undefined;
    return (
      <div className="ui-stack">
        <ErrorState {...(message ? { message } : {})} />
        {onRetry ? (
          <button type="button" className="ui-button" onClick={onRetry}>
            Повторить
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        {...(emptyMessage ? { message: emptyMessage } : {})}
        {...(emptyHint ? { hint: emptyHint } : {})}
      />
    );
  }
  return <>{children}</>;
};
