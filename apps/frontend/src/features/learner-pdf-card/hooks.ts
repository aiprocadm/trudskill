'use client';

import { useQuery } from '@tanstack/react-query';

import { learnerPdfCardApi } from './api';
import { useAuth } from '../auth/context';

import type { LearnerPdfCardAggregate } from './types';

export function useLearnerPdfCard(learnerId: string) {
  const { session } = useAuth();
  return useQuery<LearnerPdfCardAggregate>({
    queryKey: ['learner-pdf-card', learnerId],
    enabled: Boolean(session) && Boolean(learnerId),
    queryFn: () => learnerPdfCardApi.fetch(session!, learnerId)
  });
}
