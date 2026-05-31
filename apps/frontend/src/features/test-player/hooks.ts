'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { testPlayerApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  AttemptDto,
  PreExamTokenDelivery,
  RequestPreExamTokenPayload,
  SaveAnswerPayload,
  StartAttemptPayload
} from './types';

export function useMyTests() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'my-tests', session?.user.id ?? null],
    enabled: Boolean(session),
    queryFn: () => testPlayerApi.myTests(session!)
  });
}

export function useAttempt(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttempt(session!, attemptId!)
  });
}

export function useAttemptQuestions(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt-questions', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttemptQuestions(session!, attemptId!)
  });
}

export function useAttemptResult(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt-result', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttemptResult(session!, attemptId!)
  });
}

interface MutationState<T> {
  isPending: boolean;
  error: string | null;
  data: T | null;
}
function initial<T>(): MutationState<T> {
  return { isPending: false, error: null, data: null };
}
function describe(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function useStartAttempt() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AttemptDto>>(initial());
  const mutate = async (payload: StartAttemptPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.startAttempt(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось начать тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSaveAnswer() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<true>>(initial());
  const mutate = async (attemptId: string, payload: SaveAnswerPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      await testPlayerApi.saveAnswer(session, attemptId, payload);
      setState({ isPending: false, error: null, data: true });
      return true;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось сохранить ответ'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSubmitAttempt() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AttemptDto>>(initial());
  const mutate = async (attemptId: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.submitAttempt(session, attemptId);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось завершить тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useRequestPreExamToken() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<PreExamTokenDelivery>>(initial());
  const mutate = async (payload: RequestPreExamTokenPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.requestPreExamToken(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось отправить ссылку для подтверждения личности'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
