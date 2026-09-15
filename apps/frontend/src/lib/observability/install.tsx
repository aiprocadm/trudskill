'use client';

import { subscribeRenderErrors } from '@trudskill/ui';
import { useEffect } from 'react';

import { createReporter } from './reporter';
import { subscribeQueryErrors } from '../query/react-query-shim';

import type { ReactElement } from 'react';

/**
 * Подключение сбора ошибок к трём источникам (ТЗ «Стабилизация, UX и развитие», 15.1).
 *
 * ТЗ перечисляет источники поимённо: «необработанные исключения, ошибки запросов, срабатывания
 * ErrorBoundary». Все три подключены здесь, в одном месте, и держатся сторожем
 * `error-reporter-covers-sources.e2e.test.ts`: источник, отвалившийся при переделке, иначе
 * пропал бы молча — сбор продолжал бы работать, просто перестал бы видеть целый класс сбоев.
 *
 * Адрес сервера сбора берётся из настройки. Пусто — сбор молчит и ОДИН раз говорит об этом
 * (решение Р15: сервер разворачивается свой, в РФ; это настройка владельца, а не код).
 */

const sendByBeacon = async (endpoint: string, event: unknown): Promise<void> => {
  /*
   * `keepalive` — чтобы событие ушло даже если человек в этот момент закрывает вкладку:
   * падение часто и происходит перед уходом со страницы.
   */
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true
  });
};

export const ErrorReporting = (): ReactElement | null => {
  useEffect(() => {
    const reporter = createReporter({
      endpoint: process.env.NEXT_PUBLIC_ERROR_COLLECTOR_URL ?? '',
      send: sendByBeacon
    });

    const route = () => window.location.pathname;

    /* Источник 1 из 3: падение отрисовки, пойманное перехватчиком. */
    const stopRender = subscribeRenderErrors((error) => {
      void reporter.report({ kind: 'render', error, route: route() });
    });

    /* Источник 2 из 3: отказ запроса к серверу — с номером случая, если сервер его прислал. */
    const stopRequests = subscribeQueryErrors((error) => {
      /* Разобранный ответ сервера висит на ошибке полем `normalized` — там и лежит номер. */
      const requestId = (error as { normalized?: { requestId?: string } } | null)?.normalized
        ?.requestId;
      void reporter.report({
        kind: 'request',
        error,
        route: route(),
        ...(requestId ? { requestId } : {})
      });
    });

    /* Источник 3 из 3: необработанное исключение и необработанный отказ обещания. */
    const onError = (event: ErrorEvent) => {
      void reporter.report({
        kind: 'uncaught',
        error: event.error ?? event.message,
        route: route()
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void reporter.report({ kind: 'uncaught', error: event.reason, route: route() });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      stopRender();
      stopRequests();
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
};
