'use client';

import { type PropsWithChildren, useEffect, useRef } from 'react';

import { subscribeQueryErrors } from './react-query-shim';
import { useToast } from '../toast/toast-provider';

const DEDUPE_MS = 4500;

/**
 * Показывает тост при ошибке запроса (shim @tanstack/react-query).
 * У запроса можно задать `meta: { suppressGlobalErrorToast: true }`.
 */
export const QueryErrorToastBridge = ({ children }: PropsWithChildren) => {
  const { pushToast } = useToast();
  const lastShown = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return subscribeQueryErrors((error, queryKey) => {
      if (error == null) return;
      const key = JSON.stringify(queryKey);
      const now = Date.now();
      if (now - (lastShown.current.get(key) ?? 0) < DEDUPE_MS) return;
      lastShown.current.set(key, now);

      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : String(error);

      pushToast({
        variant: 'error',
        title: 'Не удалось загрузить данные',
        message
      });
    });
  }, [pushToast]);

  return <>{children}</>;
};
