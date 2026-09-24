'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { consentsApi } from './api';
import { LEARNER_NOT_LINKED_SHORT, isLearnerNotLinked } from '../../lib/errors/learner-link';
import { useAuth } from '../auth/context';

import type { ConsentDocumentsDto, ConsentKind, ConsentStateDto, ConsentStatusDto } from './types';

export function useMyConsents() {
  const { session } = useAuth();
  return useQuery<ConsentStatusDto>({
    queryKey: ['consents', 'me'],
    enabled: Boolean(session),
    queryFn: () => consentsApi.me(session!)
  });
}

export function useConsentDocuments() {
  const { session } = useAuth();
  return useQuery<ConsentDocumentsDto>({
    queryKey: ['consents', 'documents'],
    enabled: Boolean(session),
    queryFn: () => consentsApi.documents(session!)
  });
}

/**
 * Переключение согласия. Галочка = отдельный вид согласия: снятие галочки «фото» не
 * трогает согласие на обработку данных, и наоборот.
 */
export function useConsentToggle() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [pendingKind, setPendingKind] = useState<ConsentKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (kind: ConsentKind, next: boolean): Promise<boolean> => {
    if (!session) return false;
    setPendingKind(kind);
    setError(null);
    try {
      if (next) await consentsApi.grant(session, kind);
      else await consentsApi.revoke(session, kind);
      await queryClient.invalidateQueries({ queryKey: ['consents', 'me'] });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        isLearnerNotLinked(err)
          ? LEARNER_NOT_LINKED_SHORT
          : message || 'Не удалось сохранить согласие'
      );
      return false;
    } finally {
      setPendingKind(null);
    }
  };

  return { toggle, pendingKind, error };
}

/** Согласия слушателя на его карточке (МГ-C5.1, срез 12.1). */
export function useLearnerConsents(learnerId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['consents', 'learner', learnerId],
    enabled: Boolean(session) && Boolean(learnerId),
    queryFn: () => consentsApi.forLearner(session!, learnerId),
    meta: { suppressGlobalErrorToast: true }
  });
}

/** «Отметить бумажное согласие» — тот же приём `useState` + `await`, что у остальных мутаций. */
export function useMarkPaperConsent() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  return {
    isRunning,
    run: async (
      learnerId: string,
      kind: ConsentKind,
      payload: { signedAt: string; fileId?: string }
    ): Promise<ConsentStateDto> => {
      if (!session) throw new Error('Нет активной сессии');
      setIsRunning(true);
      try {
        const state = await consentsApi.markPaper(session, learnerId, kind, payload);
        await queryClient.invalidateQueries({ queryKey: ['consents', 'learner', learnerId] });
        await queryClient.invalidateQueries({ queryKey: ['learners-list'] });
        return state;
      } finally {
        setIsRunning(false);
      }
    }
  };
}
