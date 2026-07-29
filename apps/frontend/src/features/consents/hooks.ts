'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { consentsApi } from './api';
import { useAuth } from '../auth/context';

import type { ConsentDocumentsDto, ConsentKind, ConsentStatusDto } from './types';

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
        message.includes('learner_not_linked') || message.includes('No learner profile')
          ? 'Ваш аккаунт не привязан к карточке слушателя — обратитесь в учебный центр.'
          : message || 'Не удалось сохранить согласие'
      );
      return false;
    } finally {
      setPendingKind(null);
    }
  };

  return { toggle, pendingKind, error };
}
