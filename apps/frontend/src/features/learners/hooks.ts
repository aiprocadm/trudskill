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

/** Состояние заведения слушателя: тот же приём, что у правки профиля (useState + await). */
export interface CreateLearnerState {
  isPending: boolean;
  error: string | null;
}

export function useCreateLearner() {
  const { session } = useAuth();
  const [state, setState] = useState<CreateLearnerState>({ isPending: false, error: null });

  const mutate = async (payload: { name: string; code: string; organizationUnitId?: string }) => {
    if (!session) return null;
    setState({ isPending: true, error: null });
    try {
      const created = await learnersApi.create(session, payload);
      setState({ isPending: false, error: null });
      return created;
    } catch (error) {
      /*
       * Ответ 409 приходит, когда исчерпан лимит слушателей по тарифу (ФТ-D4.2). Общее
       * «Ошибка 409» человеку ничего не говорит, поэтому причина названа словами.
       */
      const message =
        error instanceof ApiClientError && error.normalized.status === 409
          ? 'Достигнут предел числа слушателей по вашему тарифу. Закройте старые группы или обратитесь к администратору платформы.'
          : error instanceof Error
            ? error.message
            : 'Не удалось завести слушателя';
      setState({ isPending: false, error: message });
      return null;
    }
  };

  return { ...state, mutate };
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
