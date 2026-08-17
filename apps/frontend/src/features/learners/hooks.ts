'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { learnersApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type { LearnerListItem, LearnersListFilters, UpdateLearnerProfilePayload } from './types';
import type { BulkOutcome } from '@trudskill/ui';

export function useLearnersList(
  filters: LearnersListFilters,
  opts?: { enabled?: boolean; silent?: boolean }
) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['learners-list', filters],
    enabled: Boolean(session) && (opts?.enabled ?? true),
    queryFn: () => learnersApi.list(session!, filters),
    ...(opts?.silent ? { meta: { suppressGlobalErrorToast: true } } : {})
  });
}

export interface UpdateLearnerProfileState {
  isPending: boolean;
  error: string | null;
  data: LearnerListItem | null;
}

export function useUpdateLearnerProfile() {
  const { session } = useAuth();
  const [state, setState] = useState<UpdateLearnerProfileState>({
    isPending: false,
    error: null,
    data: null
  });

  const mutate = async (
    learnerId: string,
    payload: UpdateLearnerProfilePayload
  ): Promise<LearnerListItem | null> => {
    if (!session) {
      setState({ isPending: false, error: 'Нет активной сессии', data: null });
      return null;
    }
    setState({ isPending: true, error: null, data: null });
    try {
      const result = await learnersApi.updateProfile(session, learnerId, payload);
      setState({ isPending: false, error: null, data: result });
      return result;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Не удалось сохранить данные';
      setState({ isPending: false, error: message, data: null });
      return null;
    }
  };

  const reset = () => {
    setState({ isPending: false, error: null, data: null });
  };

  return { ...state, mutate, reset };
}

/**
 * Массовое архивирование слушателей (CMP-011).
 *
 * Массовой ручки в API нет, а контракт в этой фазе не меняется — поэтому операция идёт
 * по одному через существующий `updateProfile`. Отсюда главное: работает принцип частичного
 * успеха — валидные записи проходят, отказы возвращаются ПОИМЁННО с причиной, а не «12 из 15».
 */
export function useArchiveLearners() {
  const { session } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const run = async (learners: LearnerListItem[]): Promise<BulkOutcome> => {
    if (!session) {
      return {
        total: learners.length,
        succeeded: 0,
        failures: learners.map((learner) => ({
          label: `${learner.lastName} ${learner.firstName}`,
          reason: 'нет активной сессии'
        }))
      };
    }

    setIsRunning(true);
    const failures: BulkOutcome['failures'] = [];
    let succeeded = 0;

    for (const learner of learners) {
      try {
        await learnersApi.updateProfile(session, learner.id, { status: 'archived' });
        succeeded += 1;
      } catch (err) {
        failures.push({
          label: `${learner.lastName} ${learner.firstName}`,
          reason: err instanceof ApiClientError ? err.message : 'неизвестная ошибка'
        });
      }
    }

    setIsRunning(false);
    return { total: learners.length, succeeded, failures };
  };

  return { run, isRunning };
}
