'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { operationsApi } from './api';
import { useAuth } from '../auth/context';

import type { DocumentTasksPage, EmailDeliveriesPage, QuarantinePage } from './types';

export function useDocumentTasks() {
  const { session } = useAuth();
  return useQuery<DocumentTasksPage>({
    queryKey: ['operations', 'document-tasks'],
    enabled: Boolean(session),
    queryFn: () => operationsApi.listDocumentTasks(session!)
  });
}

export function useQuarantine(status: string) {
  const { session } = useAuth();
  return useQuery<QuarantinePage>({
    queryKey: ['operations', 'quarantine', status],
    enabled: Boolean(session),
    queryFn: () => operationsApi.listQuarantine(session!, status)
  });
}

export function useEmailDeliveries() {
  const { session } = useAuth();
  return useQuery<EmailDeliveriesPage>({
    queryKey: ['operations', 'email-deliveries'],
    enabled: Boolean(session),
    queryFn: () => operationsApi.listEmailDeliveries(session!)
  });
}

/**
 * Действия чинящих кнопок.
 *
 * Домашний уклад: мутации через `useState` + async/await, а не мутации react-query
 * (см. `features/mvp/hooks.ts`). Здесь важнее обычного: у каждой кнопки свой ряд, и
 * блокировать нужно ИМЕННО его — иначе на экране с двумя десятками строк непонятно,
 * какая из них сейчас выполняется.
 */
export function useOperationActions(onDone: () => void) {
  const { session } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const wrap = async (id: string, action: () => Promise<unknown>, successText: string) => {
    if (!session) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successText);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  return {
    busyId,
    error,
    notice,
    retryTask: (id: string) =>
      wrap(id, () => operationsApi.retryDocumentTask(session!, id), 'Задача снова в очереди'),
    republish: (id: string) =>
      wrap(
        id,
        () => operationsApi.republishQuarantined(session!, id),
        'Сообщение вернули в работу'
      ),
    discard: (id: string) =>
      wrap(id, () => operationsApi.discardQuarantined(session!, id), 'Сообщение отброшено'),
    resendEmail: (id: string) =>
      wrap(id, () => operationsApi.resendEmail(session!, id), 'Письмо отправлено повторно')
  };
}
