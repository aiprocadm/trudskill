'use client';

import { useState } from 'react';

import { bulkEnrollmentsApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type { BulkImportOutcome, BulkImportRequest } from './types';

/**
 * Phase 2 Plan A — простая мутация без React Query (проект использует
 * `useState + async/await` для мутаций, см. CommissionDetailsScreen.onSaveEditInfo).
 *
 * Возвращает: `submit` функция, `isSubmitting` флаг, `error` сообщение, `outcome` результат.
 */
export function useBulkImportMutation() {
  const { session } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BulkImportOutcome | null>(null);

  const submit = async (payload: BulkImportRequest): Promise<BulkImportOutcome | null> => {
    if (!session) {
      setError('Нет активной сессии');
      return null;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await bulkEnrollmentsApi.bulkImport(session, payload);
      setOutcome(result);
      return result;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Не удалось выполнить загрузку';
      setError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setOutcome(null);
    setError(null);
  };

  return { submit, isSubmitting, error, outcome, reset };
}
