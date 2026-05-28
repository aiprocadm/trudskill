'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { learnersApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type { LearnerListItem, LearnersListFilters, UpdateLearnerProfilePayload } from './types';

export function useLearnersList(filters: LearnersListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['learners-list', filters],
    enabled: Boolean(session),
    queryFn: () => learnersApi.list(session!, filters)
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
