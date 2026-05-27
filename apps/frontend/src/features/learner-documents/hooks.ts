'use client';

import { useQuery } from '@tanstack/react-query';

import { learnerDocumentsApi } from './api';
import { useAuth } from '../auth/context';

import type { LearnerDocumentsResponse } from './types';

export function useMyDocuments() {
  const { session } = useAuth();
  return useQuery<LearnerDocumentsResponse>({
    queryKey: ['learner-documents', 'mine', session?.user.id ?? ''],
    enabled: Boolean(session),
    queryFn: () => learnerDocumentsApi.listMine(session!)
  });
}

export function useEnrollmentDocuments(enrollmentId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery<LearnerDocumentsResponse>({
    queryKey: ['learner-documents', 'enrollment', enrollmentId ?? ''],
    enabled: Boolean(session) && Boolean(enrollmentId),
    queryFn: () => learnerDocumentsApi.listForEnrollment(session!, enrollmentId!)
  });
}
