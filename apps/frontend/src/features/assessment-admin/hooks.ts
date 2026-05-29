'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { assessmentAdminApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  AddTestQuestionPayload,
  AssignmentListItem,
  AssignmentsListFilters,
  CreateAssignmentPayload,
  CreateQuestionBankPayload,
  CreateQuestionPayload,
  CreateTestPayload,
  QuestionBankListItem,
  QuestionBanksListFilters,
  QuestionListItem,
  QuestionsForBankFilters,
  TestListItem,
  UpdateAssignmentPayload,
  UpdateQuestionBankPayload,
  UpdateQuestionPayload,
  UpdateTestPayload,
  UpdateTestRulePayload
} from './types';

/* ---------- Queries ---------- */

export function useQuestionBanksList(filters: QuestionBanksListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'question-banks', filters],
    enabled: Boolean(session),
    queryFn: () => assessmentAdminApi.questionBanks.list(session!, filters)
  });
}

export function useQuestionBank(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'question-bank', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => assessmentAdminApi.questionBanks.get(session!, id!)
  });
}

export function useQuestionsForBank(bankId: string | null, filters: QuestionsForBankFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'questions-for-bank', bankId, filters],
    enabled: Boolean(session) && Boolean(bankId),
    queryFn: () => assessmentAdminApi.questions.listForBank(session!, bankId!, filters)
  });
}

export function useTestsList(filters: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'tests', filters],
    enabled: Boolean(session),
    queryFn: () => assessmentAdminApi.tests.list(session!, filters)
  });
}

export function useTest(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'test', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => assessmentAdminApi.tests.get(session!, id!)
  });
}

export function useTestQuestions(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'test-questions', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => assessmentAdminApi.tests.listQuestions(session!, id!)
  });
}

export function useAssignmentsList(filters: AssignmentsListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'assignments', filters],
    enabled: Boolean(session),
    queryFn: () => assessmentAdminApi.assignments.list(session!, filters)
  });
}

export function useAssignment(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'assignment', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => assessmentAdminApi.assignments.get(session!, id!)
  });
}

export function useReviewerQueue() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['assessment-admin', 'reviewer-queue'],
    enabled: Boolean(session),
    queryFn: () => assessmentAdminApi.reviewerQueue.get(session!)
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

/* --- Question banks --- */

export function useCreateQuestionBank() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionBankListItem>>(initial());
  const mutate = async (payload: CreateQuestionBankPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questionBanks.create(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось создать банк'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateQuestionBank() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionBankListItem>>(initial());
  const mutate = async (id: string, payload: UpdateQuestionBankPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questionBanks.update(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось обновить банк'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useArchiveQuestionBank() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionBankListItem>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questionBanks.archive(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось архивировать банк'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

/* --- Questions --- */

export function useCreateQuestion() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionListItem>>(initial());
  const mutate = async (payload: CreateQuestionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questions.create(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось создать вопрос'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateQuestion() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionListItem>>(initial());
  const mutate = async (id: string, payload: UpdateQuestionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questions.update(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось обновить вопрос'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useArchiveQuestion() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<QuestionListItem>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.questions.archive(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось архивировать вопрос'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

/* --- Tests --- */

export function useCreateTest() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<TestListItem>>(initial());
  const mutate = async (payload: CreateTestPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.tests.create(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось создать тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateTest() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<TestListItem>>(initial());
  const mutate = async (id: string, payload: UpdateTestPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.tests.update(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось обновить тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function usePublishTest() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<TestListItem>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.tests.publish(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось опубликовать тест'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useArchiveTest() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<TestListItem>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.tests.archive(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось архивировать тест'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpsertTestRule() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<TestListItem>>(initial());
  const mutate = async (id: string, payload: UpdateTestRulePayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.tests.upsertRule(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось сохранить правила теста'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useAddTestQuestion() {
  const { session } = useAuth();
  const [state, setState] = useState<{ isPending: boolean; error: string | null }>({
    isPending: false,
    error: null
  });
  const mutate = async (testId: string, payload: AddTestQuestionPayload) => {
    if (!session) return false;
    setState({ isPending: true, error: null });
    try {
      await assessmentAdminApi.tests.addQuestion(session, testId, payload);
      setState({ isPending: false, error: null });
      return true;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось добавить вопрос в тест') });
      return false;
    }
  };
  return { ...state, mutate };
}

export function useRemoveTestQuestion() {
  const { session } = useAuth();
  const [state, setState] = useState<{ isPending: boolean; error: string | null }>({
    isPending: false,
    error: null
  });
  const mutate = async (testId: string, questionId: string) => {
    if (!session) return false;
    setState({ isPending: true, error: null });
    try {
      await assessmentAdminApi.tests.removeQuestion(session, testId, questionId);
      setState({ isPending: false, error: null });
      return true;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось удалить вопрос из теста') });
      return false;
    }
  };
  return { ...state, mutate };
}

/* --- Assignments --- */

export function useCreateAssignment() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentListItem>>(initial());
  const mutate = async (payload: CreateAssignmentPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.assignments.create(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось создать задание'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateAssignment() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentListItem>>(initial());
  const mutate = async (id: string, payload: UpdateAssignmentPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.assignments.update(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось обновить задание'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useArchiveAssignment() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentListItem>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await assessmentAdminApi.assignments.archive(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось архивировать задание'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
