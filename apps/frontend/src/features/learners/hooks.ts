'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { learnerHistoryApi, learnersApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

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

/**
 * Зачислить выбранных слушателей в группу (ТЗ 5.5 / Э5).
 *
 * Панель массовых действий предлагала ровно одно действие — красное «Архивировать». ТЗ просит
 * 3–5 полезных; «добавить в группу» — первое из его списка, и ручка для него уже есть:
 * `POST /enrollments/bulk` принимает список слушателей одной пачкой.
 *
 * Частичный успех — по правилу репозитория: сервер отвечает поимённо, кто зачислен, кто уже
 * состоял в группе (это не отказ), а кто не прошёл и почему. Ключ идемпотентности задаёт
 * вызывающий: повтор с тем же ключом не создаёт вторых зачислений.
 */
export function useEnrollLearnersToGroup() {
  const { session } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const run = async (
    learners: LearnerListItem[],
    groupId: string,
    idempotencyKey: string
  ): Promise<BulkOutcome> => {
    const nameOf = (id: string): string => {
      const learner = learners.find((item) => item.id === id);
      return learner ? `${learner.lastName} ${learner.firstName}`.trim() : id;
    };
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
    try {
      const outcome = await mvpApi.createBulkEnrollments(session, {
        idempotencyKey,
        groupId,
        learnerIds: learners.map((learner) => learner.id)
      });
      if ('status' in outcome) {
        /* Очередь: пачка принята, но результат придёт позже — обещать зачисление нельзя. */
        return {
          total: learners.length,
          succeeded: 0,
          failures: [{ label: 'Зачисление поставлено в очередь', reason: 'итог появится позже' }]
        };
      }
      return {
        total: learners.length,
        /* Уже состоявшие в группе — не отказ: результат тот же, человек хотел именно этого. */
        succeeded: outcome.created.length + outcome.skippedExisting.length,
        failures: outcome.errors.map((error) => ({
          label: nameOf(error.learnerId),
          reason: error.message
        }))
      };
    } catch (err) {
      return {
        total: learners.length,
        succeeded: 0,
        failures: [
          {
            label: 'Зачисление не выполнено',
            reason: err instanceof ApiClientError ? err.message : 'неизвестная ошибка'
          }
        ]
      };
    } finally {
      setIsRunning(false);
    }
  };

  return { run, isRunning };
}

/** История слушателя — читается только когда открыта её вкладка (МГ-C2.1, срез 9.1). */
export function useLearnerHistory(learnerId: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['learner-history', learnerId],
    enabled: Boolean(session) && Boolean(learnerId) && enabled,
    queryFn: () => learnerHistoryApi.fetch(session!, learnerId),
    /* Ошибка показывается внутри вкладки, а не тостом поверх карточки. */
    meta: { suppressGlobalErrorToast: true }
  });
}
