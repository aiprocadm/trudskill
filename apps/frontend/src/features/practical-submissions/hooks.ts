'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { practicalSubmissionsApi, putFileToPresignedUrl } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  AssignmentSubmissionDto,
  CreateSubmissionPayload,
  UpdateSubmissionPayload
} from './types';

export function useMyAssignments() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['practical-submissions', 'my-assignments'],
    enabled: Boolean(session),
    queryFn: () => practicalSubmissionsApi.myAssignments(session!)
  });
}

export function useSubmission(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['practical-submissions', 'submission', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => practicalSubmissionsApi.getSubmission(session!, id!)
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
  return err instanceof ApiClientError
    ? err.message
    : err instanceof Error
      ? err.message
      : fallback;
}

export function useCreateSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (payload: CreateSubmissionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.createSubmission(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось создать сдачу'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (id: string, payload: UpdateSubmissionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.updateSubmission(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось сохранить'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSubmitSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.submitSubmission(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось отправить'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

/** Orchestrates: request a presigned URL → PUT the bytes to MinIO → attach fileId to the submission. */
export function useUploadSubmissionFile() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<{ fileId: string }>>(initial());
  const mutate = async (submissionId: string, file: File) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const intent = await practicalSubmissionsApi.createUploadUrl(session, submissionId, {
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      });
      await putFileToPresignedUrl(intent.uploadUrl, file);
      await practicalSubmissionsApi.updateSubmission(session, submissionId, {
        fileId: intent.fileId
      });
      const data = { fileId: intent.fileId };
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось загрузить файл'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
