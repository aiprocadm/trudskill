'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { recertificationApi } from './api';
import { useAuth } from '../auth/context';

import type {
  RecertScanSummary,
  RecertificationDraftStatus,
  RecertificationDraftView
} from './types';

export function useRecertificationQueue(status?: RecertificationDraftStatus) {
  const { session } = useAuth();
  return useQuery<RecertificationDraftView[]>({
    queryKey: ['recertification-drafts', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => recertificationApi.list(session!, status)
  });
}

/**
 * Ручные обёртки без `useMutation` — проект придерживается этого паттерна
 * (см. useLicensesMutations / useDomainMutations). На success — invalidate списка.
 */
export function useRecertificationMutations() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [rejectPending, setRejectPending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [scanPending, setScanPending] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recertification-drafts'] });

  return {
    rejectPending,
    approvePending,
    scanPending,
    rejectDraft: async (id: string, reason?: string) => {
      if (!session) throw new Error('Нет активной сессии');
      setRejectPending(true);
      try {
        const result = await recertificationApi.reject(session, id, reason);
        await invalidate();
        return result;
      } finally {
        setRejectPending(false);
      }
    },
    approveDraft: async (id: string, targetGroupId: string) => {
      if (!session) throw new Error('Нет активной сессии');
      setApprovePending(true);
      try {
        const result = await recertificationApi.approve(session, id, targetGroupId);
        await invalidate();
        return result;
      } finally {
        setApprovePending(false);
      }
    },
    runScan: async (): Promise<RecertScanSummary> => {
      if (!session) throw new Error('Нет активной сессии');
      setScanPending(true);
      try {
        const summary = await recertificationApi.scan(session);
        await invalidate();
        return summary;
      } finally {
        setScanPending(false);
      }
    }
  };
}
