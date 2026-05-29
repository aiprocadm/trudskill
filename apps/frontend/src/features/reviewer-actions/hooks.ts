'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { reviewerActionsApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  AssignmentReviewDto,
  CompleteAttemptReviewPayload,
  CompleteReviewPayload,
  CreateReviewPayload,
  ReturnSubmissionPayload
} from './types';

export function useReviewerQueue() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['reviewer-actions', 'queue'],
    enabled: Boolean(session),
    queryFn: () => reviewerActionsApi.queue(session!)
  });
}

/* ---------- Mutations (useState-based per CLAUDE.md frontend convention) ---------- */

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

export function useTakeIntoReview() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MutationState<AssignmentReviewDto>>(initial());
  const mutate = async (payload: CreateReviewPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await reviewerActionsApi.takeIntoReview(session, payload);
      setState({ isPending: false, error: null, data });
      void queryClient.invalidateQueries({ queryKey: ['reviewer-actions', 'queue'] });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось взять в проверку'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useCompleteReview() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MutationState<AssignmentReviewDto>>(initial());
  const mutate = async (reviewId: string, payload: CompleteReviewPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await reviewerActionsApi.completeReview(session, reviewId, payload);
      setState({ isPending: false, error: null, data });
      void queryClient.invalidateQueries({ queryKey: ['reviewer-actions', 'queue'] });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось завершить проверку'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useReturnSubmission() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MutationState<unknown>>(initial());
  const mutate = async (submissionId: string, payload: ReturnSubmissionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await reviewerActionsApi.returnSubmission(session, submissionId, payload);
      setState({ isPending: false, error: null, data });
      void queryClient.invalidateQueries({ queryKey: ['reviewer-actions', 'queue'] });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось вернуть на доработку'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useCompleteAttemptReview() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<MutationState<unknown>>(initial());
  const mutate = async (attemptId: string, payload: CompleteAttemptReviewPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await reviewerActionsApi.completeAttemptReview(session, attemptId, payload);
      setState({ isPending: false, error: null, data });
      void queryClient.invalidateQueries({ queryKey: ['reviewer-actions', 'queue'] });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось завершить оценку эссе'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
