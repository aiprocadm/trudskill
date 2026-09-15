'use client';

import { type PropsWithChildren, useEffect, useMemo } from 'react';

import { subscribeQueryErrors } from './react-query-shim';
import { createToastDeduper, messageOf } from '../toast/error-toast-policy';
import { useToast } from '../toast/toast-provider';

/**
 * Показывает всплывашку при ошибке запроса (шим @tanstack/react-query).
 * У запроса можно задать `meta: { suppressGlobalErrorToast: true }`.
 *
 * Правило повторов живёт отдельно (`lib/toast/error-toast-policy.ts`) и проверяется без React.
 * Раньше оно было здесь и гасило по КЛЮЧУ ЗАПРОСА — то есть не гасило вовсе, когда три разных
 * запроса одного экрана падали одинаково (ТЗ 2.3 / Б5).
 */
export const QueryErrorToastBridge = ({ children }: PropsWithChildren) => {
  const { pushToast } = useToast();
  const deduper = useMemo(() => createToastDeduper(), []);

  useEffect(() => {
    return subscribeQueryErrors((error) => {
      if (error == null) return;
      if (!deduper.allow(error, Date.now())) return;

      pushToast({
        variant: 'error',
        title: 'Не удалось загрузить данные',
        message: messageOf(error)
      });
    });
  }, [deduper, pushToast]);

  return <>{children}</>;
};
